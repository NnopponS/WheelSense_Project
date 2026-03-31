import json
from fastapi import APIRouter, HTTPException
import aiomqtt
import app.config as config
from app.schemas.core import MotionRecordStartRequest, MotionRecordStopRequest

router = APIRouter()
settings = config.settings

@router.post("/record/start")
async def start_motion_recording(body: MotionRecordStartRequest):
    payload = {"cmd": "start_record", "label": body.label, "session_id": body.session_id}
    topic = f"WheelSense/{body.device_id}/control"
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            username=settings.mqtt_user or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish(topic, json.dumps(payload))
    except Exception as e:
        raise HTTPException(502, f"Failed to send MQTT command: {e}")
    return {"message": f"Start record command sent for {body.label}", "label": body.label}


@router.post("/record/stop")
async def stop_motion_recording(body: MotionRecordStopRequest):
    payload = {"cmd": "stop_record"}
    topic = f"WheelSense/{body.device_id}/control"
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            username=settings.mqtt_user or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish(topic, json.dumps(payload))
    except Exception as e:
        raise HTTPException(502, f"Failed to send MQTT command: {e}")
    return {"message": "Stop record command sent."}
