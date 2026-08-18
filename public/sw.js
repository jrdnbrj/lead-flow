/* LeadFlow's deliberately small Web Push worker. E1 remains server-authoritative. */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const actions = [
    { action: "DONE", title: "Hecho" },
    { action: "IGNORE", title: "Ignorar" },
    { action: "POSTPONE_PLUS_ONE_HOUR", title: "En 1 hora" },
    { action: "POSTPONE_LATER", title: "Más tarde" },
    { action: "POSTPONE_TOMORROW", title: "Mañana" },
    { action: "POSTPONE_IN_THREE_DAYS", title: "En 3 días" },
  ];
  event.waitUntil(self.registration.showNotification(data.title || "LeadFlow", {
    body: data.body || "Tienes un seguimiento pendiente.",
    tag: data.tag,
    data: { openUrl: data.openUrl || "/dashboard", deliveryId: data.deliveryId, actionVersion: data.actionVersion },
    actions,
    icon: "/leadflow-mark.svg",
    badge: "/leadflow-mark.svg",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "OPEN";
  const url = new URL(data.openUrl || "/dashboard", self.location.origin);
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
