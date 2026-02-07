import { NextResponse } from "next/server";
import { getDataset } from "@/lib/asktra/data";

export async function GET() {
  try {
    const data = getDataset();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}
