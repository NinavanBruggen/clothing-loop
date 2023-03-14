export type Severity = "INFO" | "WARNING" | "ERROR" | "FATAL";

declare global {
  interface Window {
    goscope2: {
      token: string;
      baseUrl: string;
      New(token: string, baseUrl: string): void;
      Log(severity: Severity, message: string): void;
    };
  }
}

window.goscope2 = {
  token: "",
  baseUrl: "",
  New(token, baseUrl = "") {
    this.token = token;
    this.baseUrl = baseUrl;
  },
  Log(severity, message) {
    fetch(this.baseUrl + "/goscope2/js", {
      method: "post",
      body: JSON.stringify({ severity, message, token: this.token }),
    }).catch((err) => console.log(err));
  },
};

const token = import.meta.env.VITE_GOSCOPE2_TOKEN;
if (token && window) {
  window.goscope2.New(token, "/api");

  injectConsole("error", "ERROR");
}

function injectConsole(
  consoleKey: "info" | "warn" | "error",
  severity: Severity
): void {
  const oldFn = window.console[consoleKey];

  let newFn = (...args: any[]) => {
    oldFn(...args);
    const message =
      typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
    window.goscope2.Log(severity, message);
  };
  window.console[consoleKey] = newFn as any;
}