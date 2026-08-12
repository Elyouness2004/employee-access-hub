package com.hub.documents.api;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.documents.config.KeycloakRealmRoleConverter;
import com.hub.documents.infrastructure.AuditLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared fixture for documents web tests: full application context on the
 * H2/Flyway schema (three seeded categories at EMPLOYEE/HR/ADMIN tiers), MockMvc
 * with Keycloak-shaped tokens run through the production role converter,
 * transaction rollback per test, and a throwaway blob-storage root so uploads
 * write real bytes without touching anything that outlives the run.
 *
 * <p>The upload ceiling is deliberately tiny here (1 KB) so the 413 path can be
 * exercised without allocating megabytes.
 */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks",
        "hub.documents.storage.max-file-size=1KB"
})
@AutoConfigureMockMvc
@Transactional
abstract class DocumentsWebTestSupport {

    /** Per-JVM temporary blob root; the OS reclaims it, and nothing outside it is ever written. */
    protected static final Path STORAGE_ROOT = createTemporaryStorageRoot();

    @DynamicPropertySource
    static void storageRoot(DynamicPropertyRegistry registry) {
        registry.add("hub.documents.storage.root", STORAGE_ROOT::toString);
    }

    private static Path createTemporaryStorageRoot() {
        try {
            return Files.createTempDirectory("documents-service-test-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static final String GENERAL_CAT = "cccccccc-0000-0000-0000-000000000001"; // EMPLOYEE
    static final String HR_CAT      = "cccccccc-0000-0000-0000-000000000002"; // HR (sensitive)
    static final String PAYROLL_CAT = "cccccccc-0000-0000-0000-000000000003"; // ADMIN (sensitive)

    static final UUID ALICE_KC = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID MARK_KC  = UUID.fromString("22222222-2222-2222-2222-222222222222");
    static final UUID HANA_KC  = UUID.fromString("33333333-3333-3333-3333-333333333333");
    static final UUID ADAM_KC  = UUID.fromString("66666666-6666-6666-6666-666666666666");
    static final UUID BOB_KC   = UUID.fromString("55555555-5555-5555-5555-555555555555");

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected AuditLogRepository auditLog;

    protected static RequestPostProcessor as(UUID subject, String username, String... roles) {
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject.toString())
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", username)
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return jwt().jwt(token).authorities(new KeycloakRealmRoleConverter());
    }

    protected static RequestPostProcessor asAlice() {
        return as(ALICE_KC, "alice.employee", "EMPLOYEE");
    }

    protected static RequestPostProcessor asBob() {
        return as(BOB_KC, "bob.employee", "EMPLOYEE");
    }

    protected static RequestPostProcessor asMark() {
        return as(MARK_KC, "mark.manager", "MANAGER", "EMPLOYEE");
    }

    protected static RequestPostProcessor asHana() {
        return as(HANA_KC, "hana.hr", "HR", "EMPLOYEE");
    }

    protected static RequestPostProcessor asAdam() {
        return as(ADAM_KC, "adam.admin", "ADMIN", "EMPLOYEE");
    }

    /** Uploads a document (HR) and returns its id. {@code ownerKc} may be null. */
    protected String upload(RequestPostProcessor actor, String title, String categoryId, UUID ownerKc)
            throws Exception {
        String owner = ownerKc == null ? "" : "\"ownerKeycloakId\": \"%s\", ".formatted(ownerKc);
        MvcResult result = mockMvc.perform(post("/api/documents").with(actor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"title\": \"%s\", %s\"categoryId\": \"%s\", "
                                + "\"storageKey\": \"blob://docs/%s\", \"contentType\": \"application/pdf\", "
                                + "\"sizeBytes\": 2048}")
                                .formatted(title, owner, categoryId, title)))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonField(result, "id");
    }

    /** Builds a multipart upload: the file plus the JSON {@code metadata} part. */
    protected MockMultipartHttpServletRequestBuilder uploadOf(String filename, String contentType, byte[] bytes,
                                                             String title, String categoryId, UUID ownerKc) {
        String owner = ownerKc == null ? "" : ", \"ownerKeycloakId\": \"%s\"".formatted(ownerKc);
        String metadata = "{\"title\": \"%s\", \"categoryId\": \"%s\"%s}".formatted(title, categoryId, owner);
        return (MockMultipartHttpServletRequestBuilder) multipart("/api/documents")
                .file(new MockMultipartFile("file", filename, contentType, bytes))
                .file(new MockMultipartFile("metadata", "", MediaType.APPLICATION_JSON_VALUE,
                        metadata.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    /** Uploads a real file (HR) and returns its id. */
    protected String uploadFile(RequestPostProcessor actor, String title, String categoryId,
                                UUID ownerKc, byte[] bytes) throws Exception {
        MvcResult result = mockMvc.perform(uploadOf(title + ".pdf", "application/pdf", bytes,
                        title, categoryId, ownerKc).with(actor))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonField(result, "id");
    }

    protected String jsonField(MvcResult result, String field) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString()).get(field).asText();
    }
}
