from pathlib import Path
p=Path('probe_chain.log')
p.write_text('start\\n', encoding='utf-8')
import app.config
p.write_text(p.read_text(encoding='utf-8') + 'config\\n', encoding='utf-8')
from app.core.security import validate_runtime_settings
p.write_text(p.read_text(encoding='utf-8') + 'security\\n', encoding='utf-8')
from app.db.session import init_db
p.write_text(p.read_text(encoding='utf-8') + 'db_session\\n', encoding='utf-8')
from app.mqtt_handler import mqtt_listener
p.write_text(p.read_text(encoding='utf-8') + 'mqtt_handler\\n', encoding='utf-8')
from app.api.router import api_router
p.write_text(p.read_text(encoding='utf-8') + 'api_router\\n', encoding='utf-8')
import os; p.write_text(p.read_text(encoding='utf-8') + 'done\\n', encoding='utf-8'); os._exit(0)
