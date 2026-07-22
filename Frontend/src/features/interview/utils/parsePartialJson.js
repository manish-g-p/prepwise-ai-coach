/**
 * Best-effort parser for a JSON string that is still being streamed in.
 *
 * The AI streams a single large JSON object one chunk at a time, so at any
 * moment we usually hold a *truncated* JSON string (an open object, a half
 * finished array, a partial string literal). This closes the open structures
 * and parses what we have so the UI can render sections as they arrive.
 *
 * Returns the parsed object, or null if nothing parseable yet.
 */
export function parsePartialJson(text) {
    if (!text) return null

    // Strip markdown code fences the model sometimes adds.
    let s = text.replace(/```json/gi, "").replace(/```/g, "")

    const start = s.indexOf("{")
    if (start === -1) return null
    s = s.slice(start)

    // First try: close the structures at the very end of the current text.
    const closed = closeOpenStructures(s)
    if (closed) {
        try {
            return JSON.parse(closed)
        } catch {
            // fall through to the trimming fallback
        }
    }

    // Fallback: the tail may hold a dangling key/value (e.g. `,"foo":`).
    // Trim back a bounded number of chars until a prefix parses cleanly.
    const minLen = Math.max(1, s.length - 400)
    for (let end = s.length - 1; end >= minLen; end--) {
        const candidate = closeOpenStructures(s.slice(0, end))
        if (!candidate) continue
        try {
            return JSON.parse(candidate)
        } catch {
            // keep trimming
        }
    }

    return null
}

/**
 * Walk the (possibly truncated) JSON and append the closers needed to make it
 * syntactically complete: terminate an open string, then close every open
 * array/object in the correct order. Also drops a dangling trailing comma or
 * `"key":` with no value, which would otherwise be unparseable.
 */
function closeOpenStructures(input) {
    const stack = []
    let inString = false
    let escaped = false

    for (let i = 0; i < input.length; i++) {
        const ch = input[i]

        if (inString) {
            if (escaped) {
                escaped = false
            } else if (ch === "\\") {
                escaped = true
            } else if (ch === '"') {
                inString = false
            }
            continue
        }

        if (ch === '"') {
            inString = true
        } else if (ch === "{" || ch === "[") {
            stack.push(ch)
        } else if (ch === "}" || ch === "]") {
            stack.pop()
        }
    }

    let result = input

    // Close an unterminated string literal.
    if (inString) result += '"'

    // Remove a dangling `,` or `"key":` that has no value yet.
    result = result.replace(/,\s*$/, "")
    result = result.replace(/"[^"]*"\s*:\s*$/, "")
    result = result.replace(/,\s*$/, "")

    // Append the matching closer for every still-open structure.
    for (let i = stack.length - 1; i >= 0; i--) {
        result += stack[i] === "{" ? "}" : "]"
    }

    return result
}
