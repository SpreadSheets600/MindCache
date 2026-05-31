/**
 * Utility function to cleanly extract and format error messages from backend responses,
 * standard Error instances, or arbitrary exception objects.
 */
export const getErrorMessage = (err: any, fallback = "An error occurred during the request."): string => {
  if (!err) return fallback;

  // 1. Check if the error contains details object/array (e.g., from BackendClientError)
  if (err.details) {
    if (typeof err.details === "string") {
      return err.details;
    }
    if (Array.isArray(err.details)) {
      // Pydantic validation errors: e.g. [{"msg": "String should have at least 1 character"}]
      return err.details.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
    }
    if (typeof err.details === "object") {
      if (err.details.detail) {
        if (typeof err.details.detail === "string") return err.details.detail;
        if (Array.isArray(err.details.detail)) {
          return err.details.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
        }
      }
      if (err.details.message) return String(err.details.message);
      return JSON.stringify(err.details);
    }
  }

  // 2. Check the message property on the error object
  if (err.message) {
    if (typeof err.message === "object") {
      try {
        return JSON.stringify(err.message);
      } catch {
        return String(err.message);
      }
    }

    // If message is a JSON string, try to parse it to see if it contains details/messages
    try {
      const parsed = JSON.parse(err.message);
      if (Array.isArray(parsed)) {
        return parsed.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
      }
      if (parsed && typeof parsed === "object") {
        if (parsed.message) return String(parsed.message);
        if (parsed.detail) {
          if (typeof parsed.detail === "string") return parsed.detail;
          if (Array.isArray(parsed.detail)) {
            return parsed.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
          }
        }
        return JSON.stringify(parsed);
      }
    } catch {
      // Not a JSON string, fallback to String(message)
    }

    return String(err.message);
  }

  // 3. Fallback to general String conversion
  return String(err);
};
