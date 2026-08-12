# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B package -DskipTests
# Layered extraction: dependencies land in their own image layers, so a
# code-only change re-ships kilobytes instead of the whole fat jar.
RUN java -Djarmode=tools -jar target/*.jar extract --layers --launcher --destination extracted

# Runtime stage — slim JRE, non-root, root-owned files (immutable to the app user)
FROM eclipse-temurin:21-jre
ARG APP_VERSION=0.1.0-SNAPSHOT
LABEL org.opencontainers.image.title="analytics-service" \
      org.opencontainers.image.description="Employee Access Hub analytics: read-only cross-service KPI aggregator with circuit breakers and snapshot caches, Power BI facade" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.vendor="com.hub"
RUN useradd --system --uid 1001 appuser
USER appuser
WORKDIR /app
COPY --from=build /workspace/extracted/dependencies/ ./
COPY --from=build /workspace/extracted/spring-boot-loader/ ./
COPY --from=build /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build /workspace/extracted/application/ ./
EXPOSE 9005
# Self-describing health (compose overrides with its own probe); bash /dev/tcp
# because the JRE image ships no curl/wget.
HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=20s \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/9005 && printf 'GET /actuator/health HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q UP <&3"]
# ExitOnOutOfMemoryError: die loudly and let the restart policy recover instead
# of limping on with a corrupted heap. Tune further via JDK_JAVA_OPTIONS.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-XX:+ExitOnOutOfMemoryError", "org.springframework.boot.loader.launch.JarLauncher"]
