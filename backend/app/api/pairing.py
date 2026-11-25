from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.pairing import save_trusted_ids, trusted_ids, valid_extension_id

router = APIRouter(prefix="/pairing", tags=["Extension pairing"])
PAIRING_PATH = settings.DATA_DIR / "trusted-extensions.json"


class ExtensionID(BaseModel):
    extension_id: str


@router.get("")
async def list_extensions():
    return {"extension_ids": sorted(trusted_ids(PAIRING_PATH))}


@router.post("")
async def pair_extension(body: ExtensionID):
    extension_id = body.extension_id.strip().lower()
    if not valid_extension_id(extension_id):
        raise HTTPException(400, "Enter the 32-character extension ID from your browser")
    values = trusted_ids(PAIRING_PATH)
    values.add(extension_id)
    save_trusted_ids(PAIRING_PATH, values)
    return {"extension_ids": sorted(values)}


@router.delete("/{extension_id}")
async def unpair_extension(extension_id: str):
    if not valid_extension_id(extension_id):
        raise HTTPException(400, "Invalid extension ID")
    values = trusted_ids(PAIRING_PATH)
    values.discard(extension_id)
    save_trusted_ids(PAIRING_PATH, values)
    return {"extension_ids": sorted(values)}
