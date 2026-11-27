import { ApiError } from "../errors.ts";
import type { CreateTodo, ListTodos, UpdateTodo } from "./types.ts";

const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(message: string): never {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}

export function validateId(id: string): string {
  if (!UUID.test(id)) invalid("The todo id must be a UUID.");
  return id.toLowerCase();
}

function parentId(input: unknown): string | null {
  if (input === null) return null;
  if (typeof input !== "string" || !UUID.test(input)) {
    invalid("parentId must be a UUID or null.");
  }
  return input.toLowerCase();
}

/** Check the actual streamed size; Content-Length alone is not trustworthy. */
export async function readJson(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json.");
  }
  const tooLarge = () => new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON body exceeds 16 KiB.");
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_BODY_BYTES) throw tooLarge();

  const reader = request.body?.getReader();
  if (!reader) invalid("A JSON object is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request contains invalid JSON.");
  }
}

function object(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    invalid("A JSON object is required.");
  }
  return input as Record<string, unknown>;
}

function allowKeys(input: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(input).some((key) => !keys.includes(key))) {
    invalid(`Allowed fields: ${keys.join(", ")}.`);
  }
}

function title(input: unknown): string {
  if (typeof input !== "string") invalid("title must be a string.");
  const value = input.trim();
  if (!value || Array.from(value).length > 200 || value.includes("\0")) {
    invalid("title must contain 1–200 characters after trimming.");
  }
  return value;
}

function description(input: unknown): string {
  if (
    typeof input !== "string" || Array.from(input).length > 2000 ||
    input.includes("\0")
  ) {
    invalid("description must be a string of at most 2000 characters.");
  }
  return input;
}

export function parseCreate(input: unknown): CreateTodo {
  const data = object(input);
  allowKeys(data, ["title", "description", "parentId"]);
  return {
    title: title(data.title),
    description: data.description === undefined ? "" : description(data.description),
    parentId: data.parentId === undefined ? null : parentId(data.parentId),
  };
}

export function parseUpdate(input: unknown): UpdateTodo {
  const data = object(input);
  allowKeys(data, ["title", "description", "completed", "parentId"]);
  if (Object.keys(data).length === 0) invalid("Provide at least one field.");
  const result: UpdateTodo = {};
  if ("parentId" in data) result.parentId = parentId(data.parentId);
  if ("title" in data) result.title = title(data.title);
  if ("description" in data) result.description = description(data.description);
  if ("completed" in data) {
    if (typeof data.completed !== "boolean") invalid("completed must be a boolean.");
    result.completed = data.completed;
  }
  return result;
}

export function parseList(params: URLSearchParams): ListTodos {
  const allowed = ["completed", "parentId", "limit", "offset"];
  for (const key of params.keys()) {
    if (!allowed.includes(key)) invalid(`Unknown query parameter: ${key}.`);
    if (params.getAll(key).length > 1) invalid(`Duplicate query parameter: ${key}.`);
  }

  function number(name: string, fallback: number, min: number, max: number) {
    const raw = params.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw)) invalid(`${name} must be an integer.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      invalid(`${name} must be between ${min} and ${max}.`);
    }
    return value;
  }

  const completed = params.get("completed");
  const parent = params.get("parentId");
  if (completed !== null && completed !== "true" && completed !== "false") {
    invalid("completed must be true or false.");
  }
  return {
    ...(completed === null ? {} : { completed: completed === "true" }),
    ...(parent === null ? {} : { parentId: parent === "null" ? null : parentId(parent) }),
    limit: number("limit", 50, 1, 100),
    offset: number("offset", 0, 0, 2_147_483_647),
  };
}
