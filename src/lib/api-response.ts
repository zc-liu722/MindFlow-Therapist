import { NextResponse } from "next/server";

export function jsonWithKey<Key extends string, Value>(key: Key, value: Value) {
  return NextResponse.json({ [key]: value } as Record<Key, Value>);
}

export function okJson<Result>(result?: Result) {
  if (typeof result === "undefined") {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, result });
}
