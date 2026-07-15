"""Typed FastAPI adapter for the framework-neutral investigation core."""

import asyncio
from typing import Literal

from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .agent_runtime import AgentRuntime
from .investigation import InvestigationCoordinator
from .security_analyzer import SecurityAnalyzer


class InvestigationRequest(BaseModel):
    scan_type: Literal["message", "link", "email", "phone"]
    content: str = Field(min_length=1, max_length=10_000)


class HealthResponse(BaseModel):
    status: str
    architecture: str
    agents: list[str]


coordinator = InvestigationCoordinator(SecurityAnalyzer())
runtime = AgentRuntime(coordinator)
app = FastAPI(title="SafeMind AI Security Agent", version="4.0.0")


@app.get("/")
async def root():
    return {
        "service": "SafeMind AI Security Agent API",
        "status": "ok",
        "frontend": "http://127.0.0.1:5173",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        architecture="multi-agent-investigation",
        agents=["input", "threat_intelligence", "ml", "evidence", "reasoning", "decision"],
    )


@app.post("/api/spam-check")
@app.post("/api/investigate")
async def investigate(request: InvestigationRequest):
    try:
        result = await asyncio.to_thread(runtime.run, request.scan_type, request.content)
        result.pop("agent_run", None)
        return result
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.websocket("/ws/investigate")
async def investigate_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        payload = await websocket.receive_json()
        request = InvestigationRequest.model_validate(payload)
        await websocket.send_json({"type": "investigation_started"})
        result = await asyncio.to_thread(runtime.run, request.scan_type, request.content)
        result.pop("agent_run", None)
        for event in result.get("investigation", {}).get("timeline", []):
            await websocket.send_json({"type": "agent_completed", "event": event})
        await websocket.send_json({"type": "investigation_completed", "result": result})
    except WebSocketDisconnect:
        return
    except Exception as error:
        await websocket.send_json({"type": "investigation_error", "error": str(error)})
        await websocket.close(code=1003)
