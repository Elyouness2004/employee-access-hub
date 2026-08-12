package com.hub.hr.support;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

/**
 * Minimal stand-in for Keycloak's token side: an RSA keypair whose public JWK set
 * is served over HTTP, and a signer producing Keycloak-shaped access tokens
 * (realm_access.roles, aud, iss). Lets tests exercise the REAL decoder path
 * (JWKS fetch, signature, issuer, audience, expiry) without a running Keycloak.
 */
public final class TestIdentityProvider implements AutoCloseable {

    public static final String ISSUER = "http://test-issuer/realms/employee-hub";
    public static final String AUDIENCE = "hub-api";

    private final RSAKey rsaKey;
    private final RSAKey rogueKey;
    private final HttpServer server;

    public TestIdentityProvider() {
        try {
            this.rsaKey = new RSAKeyGenerator(2048).keyID("test-key").generate();
            this.rogueKey = new RSAKeyGenerator(2048).keyID("test-key").generate();
            this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            byte[] jwks = new JWKSet(rsaKey.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            server.createContext("/jwks", exchange -> respondJson(exchange, jwks));
            server.start();
        } catch (Exception e) {
            throw new IllegalStateException("cannot start test identity provider", e);
        }
    }

    private static void respondJson(com.sun.net.httpserver.HttpExchange exchange, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    public String jwksUri() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks";
    }

    /** Valid token with the given realm roles; customize claims via the consumer. */
    public String token(List<String> realmRoles, Consumer<JWTClaimsSet.Builder> customizer) {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject(UUID.randomUUID().toString())
                .audience(List.of(AUDIENCE, "account"))
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .claim("preferred_username", "test.user")
                .claim("realm_access", Map.of("roles", realmRoles));
        customizer.accept(claims);
        return sign(claims.build(), rsaKey);
    }

    public String token(List<String> realmRoles) {
        return token(realmRoles, c -> { });
    }

    /** Same claims, signed by a key NOT in the served JWK set (signature must fail). */
    public String tokenSignedByRogueKey(List<String> realmRoles) {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject(UUID.randomUUID().toString())
                .audience(List.of(AUDIENCE))
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .claim("preferred_username", "test.user")
                .claim("realm_access", Map.of("roles", realmRoles))
                .build();
        return sign(claims, rogueKey);
    }

    private static String sign(JWTClaimsSet claims, RSAKey key) {
        try {
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(),
                    claims);
            jwt.sign(new RSASSASigner(key));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException("cannot sign test token", e);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
