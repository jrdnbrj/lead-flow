export async function registerLeadFlowServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeToLeadFlowPush(publicKey: string): Promise<PushSubscriptionJSON> {
  const registration = await registerLeadFlowServiceWorker();
  if (!registration) throw new Error("Este navegador no permite notificaciones.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Las notificaciones están bloqueadas en el navegador." : "No se activaron las notificaciones.");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
  return subscription.toJSON();
}
