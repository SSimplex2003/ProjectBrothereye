import { NextResponse } from "next/server"
import { fetchStreamEvents } from "@/lib/stream-server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const events = await fetchStreamEvents(id)
    return NextResponse.json({ camera_id: id, events })
  } catch (error) {
    console.error("Failed to fetch camera events:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch events" },
      { status: 500 }
    )
  }
}
