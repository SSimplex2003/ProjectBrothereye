import { NextResponse } from "next/server"
import { fetchStreamEvents } from "@/lib/stream-server"

export async function GET() {
  try {
    const events = await fetchStreamEvents()
    return NextResponse.json({ events })
  } catch (error) {
    console.error("Failed to fetch stream events:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch events" },
      { status: 500 }
    )
  }
}
