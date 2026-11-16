import { NextResponse } from "next/server"

const STREAM_SERVER = process.env.NEXT_PUBLIC_STREAM_SERVER || "http://localhost:5000"

export async function GET() {
  try {
    const res = await fetch(`${STREAM_SERVER}/api/health`, {
      signal: AbortSignal.timeout(5000)
    })
    
    if (!res.ok) {
      return NextResponse.json({
        status: "error",
        cameras_total: 0,
        cameras_connected: 0,
        db_enabled: false
      })
    }
    
    const data = await res.json()
    return NextResponse.json({
      status: data.status || "ok",
      cameras_total: data.cameras_total || 0,
      cameras_connected: data.cameras_connected || 0,
      db_enabled: data.db_enabled ?? false
    })
  } catch {
    return NextResponse.json({
      status: "offline",
      cameras_total: 0,
      cameras_connected: 0,
      db_enabled: false
    })
  }
}
