from typing import Annotated

from pydantic import BeforeValidator

from app.roles import canonicalize_role


CanonicalRole = Annotated[str, BeforeValidator(canonicalize_role)]
