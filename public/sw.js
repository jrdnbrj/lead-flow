/* LeadFlow's deliberately small Web Push worker. E1 remains server-authoritative. */
const LEADFLOW_SW_VERSION = "push-2026-08-18-3";

function sameOriginAppUrl(value) {
  const fallback = new URL("/dashboard", self.location.origin);
  if (typeof value !== "string" || value.length === 0) return fallback;

  try {
    const candidate = new URL(value, self.location.origin);
    if (candidate.origin === self.location.origin) return candidate;

    // Old notifications may contain a development origin such as
    // 0.0.0.0:3000. Keep only the route and use the PWA's current origin.
    return new URL(`${candidate.pathname}${candidate.search}${candidate.hash}`, self.location.origin);
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = {};
  }
  const actions = [
    { action: "DONE", title: "Hecho" },
    { action: "POSTPONE_PLUS_ONE_HOUR", title: "En 1 hora" },
    { action: "IGNORE", title: "Ignorar" },
    { action: "POSTPONE_LATER", title: "Más tarde" },
    { action: "POSTPONE_TOMORROW", title: "Mañana" },
    { action: "POSTPONE_IN_THREE_DAYS", title: "En 3 días" },
  ];
  const maxActions = typeof Notification !== "undefined" && typeof Notification.maxActions === "number" ? Notification.maxActions : actions.length;
  const openUrl = sameOriginAppUrl(data.openUrl || "/dashboard");
  event.waitUntil(self.registration.showNotification(data.title || "LeadFlow", {
    body: data.body || "Tienes un seguimiento pendiente.",
    tag: data.tag,
    data: { openUrl: `${openUrl.pathname}${openUrl.search}${openUrl.hash}`, deliveryId: data.deliveryId, actionVersion: data.actionVersion, serviceWorkerVersion: LEADFLOW_SW_VERSION },
    actions: actions.slice(0, Math.max(0, maxActions)),
    icon: "/leadflow-mark.svg",
    badge: "/leadflow-mark.svg",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "OPEN";
  const url = sameOriginAppUrl(data.openUrl || "/dashboard");
  if (action !== "OPEN") {
    url.pathname = "/api/push/command";
    url.searchParams.set("deliveryId", data.deliveryId || "");
    url.searchParams.set("actionVersion", String(data.actionVersion || ""));
    url.searchParams.set("command", action);
  }
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => "focus" in client);
    return open ? open.navigate(url.href).then((client) => client.focus()) : clients.openWindow(url.href);
  }));
});
