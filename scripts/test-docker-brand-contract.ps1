param(
    [string]$ComposeFile = "server/docker-compose.sim.yml"
)

$configJson = docker compose -f $ComposeFile config --format json
if ($LASTEXITCODE -ne 0) {
    throw "docker compose config failed for $ComposeFile"
}

$config = $configJson | ConvertFrom-Json
$server = $config.services.'wheelsense-platform-server'
$web = $config.services.'wheelsense-platform-web'

if ($server.environment.APP_NAME -ne "Ease AI Server") {
    throw "server APP_NAME must be Ease AI Server"
}
if ($server.labels.'org.opencontainers.image.title' -ne "Ease AI Server") {
    throw "server OCI title must be Ease AI Server"
}
if ($web.labels.'org.opencontainers.image.title' -ne "Ease AI Web") {
    throw "web OCI title must be Ease AI Web"
}
if (-not $web.healthcheck.test) {
    throw "web service must define a healthcheck"
}

Write-Output "DOCKER_BRAND_CONTRACT_PASS"
