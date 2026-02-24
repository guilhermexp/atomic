import toast from "react-hot-toast";

const defaultDuration = 3000;

export const toastStyles = {
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: -0.15,
  minWidth: 150,
  overflow: "hidden",
};

export function errorToMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message || "Unknown error";
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message || "Unknown error";
  }

  try {
    const json = JSON.stringify(error);
    if (json === "{}" || json === "[]") {
      return "Unknown error";
    }
    return json;
  } catch {
    return String(error);
  }
}

/** Show an error toast. Use for API failures, gateway errors, etc. */
export function addToastError(message: unknown): void {
  const stringMessage = errorToMessage(message);
  console.error(message);
  toast.error(stringMessage, { duration: defaultDuration, style: toastStyles });
}
