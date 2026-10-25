# Error Codes and Troubleshooting Guide

## Overview

This document describes error handling, error codes, and troubleshooting procedures for the WheelSense backend system.

## Error Categories

### User-Facing Errors

These errors are returned to the user via the chat interface or API responses.

#### LLM Service Unavailable (503)
- **Message**: "I'm having trouble connecting to the AI service. Please try again in a moment."
- **Cause**: Ollama service is unavailable, circuit breaker is open, or connection timeout
- **User Action**: Wait a moment and try again
- **Internal**: Check `/api/health` endpoint for LLM service status

#### Tool Execution Failed (500)
- **Message**: "I couldn't complete that action. The device may be offline or there was a connection issue."
- **Cause**: MQTT command failed, device offline, or network issue
- **User Action**: Check device connection, try again
- **Internal**: Check MQTT connection status, device state in database

#### Invalid Request (400)
- **Message**: HTTP 400 with specific error detail
- **Cause**: Missing required parameters, invalid format
- **User Action**: Check request format and retry
- **Internal**: Validate request structure

### Internal Errors (Logged, Not User-Facing)

These errors are logged but do not interrupt user experience.

#### Background Job Errors
- **Schedule Checker**: Errors logged at ERROR level, service continues
- **House Check**: Errors logged at ERROR level, service continues
- **Notification Persistence**: Errors logged at WARN level, notification still sent

#### Database Errors
- **Query Timeout**: Logged at ERROR level, operation fails gracefully
- **Connection Issues**: Logged at ERROR level, system continues in degraded mode

## Error Codes Reference

### HTTP Status Codes

- **200 OK**: Request successful
- **400 Bad Request**: Invalid request format or parameters
- **500 Internal Server Error**: Server-side error (tool execution, database)
- **503 Service Unavailable**: LLM service unavailable, circuit breaker open

### Circuit Breaker States

- **CLOSED**: Normal operation, requests proceed
- **OPEN**: Service failing, requests rejected immediately
- **HALF_OPEN**: Testing recovery, one request allowed

### Service Health Status

- **ok**: Service operating normally
- **slow**: Service responding but slowly
- **unavailable**: Service not available
- **disconnected**: Connection lost (MQTT)
- **error**: Service error detected
- **running**: Background job running normally
- **stopped**: Background job stopped

## Troubleshooting Guide

### LLM Service Issues

**Symptom**: Chat requests return 503 error

**Diagnosis**:
1. Check `/api/health` endpoint - LLM status should show "unavailable" or "error"
2. Check logs for circuit breaker state
3. Verify Ollama is running: `curl http://localhost:11434/api/tags`

**Resolution**:
- Start Ollama service if not running
- Wait 30 seconds for circuit breaker to transition to HALF_OPEN
- Check Ollama model availability

### MQTT Connection Issues

**Symptom**: Device control fails, error message mentions "device may be offline"

**Diagnosis**:
1. Check `/api/health` endpoint - MQTT status should show "disconnected"
2. Check MQTT broker is running
3. Verify network connectivity

**Resolution**:
- Restart MQTT broker if needed
- Check network connectivity
- Verify MQTT credentials in configuration

### Database Issues

**Symptom**: Slow responses, timeouts, or errors

**Diagnosis**:
1. Check `/api/health` endpoint - Database status should show "slow" or "error"
2. Check database file permissions
3. Check for database locks

**Resolution**:
- Check database file exists and is accessible
- Verify no other process is locking the database
- Check disk space

### Background Job Issues

**Symptom**: Schedule notifications not triggering, house checks not running

**Diagnosis**:
1. Check `/api/health` endpoint - Background job status
2. Check logs for background job errors
3. Verify service is running

**Resolution**:
- Check service health status via `/api/health`
- Review error logs for specific failures
- Restart backend if service is stopped

### Context Size Issues

**Symptom**: Warnings in logs about context truncation

**Diagnosis**:
1. Check logs for "Context truncation occurred" warnings
2. Review context size breakdown in logs

**Resolution**:
- This is expected behavior - context is automatically truncated
- Review conversation summary settings if truncation is frequent
- Consider increasing limits if needed (requires code change)

## Logging Levels

### INFO
- Normal operations
- Successful tool executions
- Service startup/shutdown
- Schedule notifications sent

### WARN
- Recoverable issues
- Tool execution failures (with user-friendly error)
- RAG retrieval timeouts
- Database query warnings

### ERROR
- Critical failures
- LLM request failures
- Tool execution exceptions
- Database transaction failures
- Background job crashes

### DEBUG
- Detailed operation information
- Tool parsing details
- Context assembly details
- RAG retrieval scores

## Correlation IDs

All chat requests include a correlation ID in format: `chat_{12-char-hex}`

Use correlation ID to trace:
- Request → LLM call → Tool execution → Response
- All logs for a single request
- Error investigation

Example: `[chat_a1b2c3d4e5f6] LLM request completed`

## Metrics

System metrics are available via `/api/health/metrics`:

- `chat_requests_total`: Total chat requests
- `chat_errors_total`: Total chat errors
- `llm_requests_total`: Total LLM API calls
- `llm_errors_total`: Total LLM errors
- `tool_executions_total`: Total tool executions
- `tool_errors_total`: Total tool errors
- `schedule_checks_total`: Total schedule checks
- `schedule_errors_total`: Total schedule check errors
- `house_checks_total`: Total house checks
- `house_check_errors_total`: Total house check errors

## Health Check Endpoint

### `/api/health`

Returns overall system health and service status:

```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-01T12:00:00",
  "services": {
    "database": "ok|slow|error",
    "llm": "ok|unavailable|degraded|error",
    "mqtt": "ok|disconnected|error",
    "schedule_checker": "running|stopped|error",
    "house_check": "ok|error",
    "rag": "available|unavailable|error"
  },
  "metrics": { ... }
}
```

### `/api/health/metrics`

Returns system metrics only.

## Best Practices

1. **Monitor Health Endpoint**: Regularly check `/api/health` for service status
2. **Use Correlation IDs**: Include correlation ID when reporting issues
3. **Check Logs**: Review logs with correlation ID for request tracing
4. **Graceful Degradation**: System continues operating even if some services fail
5. **Circuit Breaker**: LLM circuit breaker prevents cascading failures

## Common Issues and Solutions

### Issue: Chat not responding
- **Check**: LLM service status in `/api/health`
- **Solution**: Verify Ollama is running

### Issue: Device control not working
- **Check**: MQTT status in `/api/health`
- **Solution**: Verify MQTT broker is running and connected

### Issue: Schedule notifications not appearing
- **Check**: Schedule checker status in `/api/health`
- **Solution**: Verify schedule checker is running, check logs for errors

### Issue: House check not triggering
- **Check**: House check service status in `/api/health`
- **Solution**: Verify location changes are being detected, check logs

