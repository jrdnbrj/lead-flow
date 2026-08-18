"use client";

import { useEffect, useState } from "react";

type SafeSubscription = {
  id: string;
  endpointFingerprint: string;
  endpointHost: string;
  p256dhPresent: boolean;
  authPresent: boolean;
  subscriptionGeneration: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ClientState = {
  secureContext: boolean;
  notificationPermission: string;
  serviceWorkerController: boolean;
  serviceWorkerScope: string;
  serviceWorkerScript: string;
  serviceWorkerState: string;
  serviceWorkerFingerprint: string;
  pushManager: boolean;
  subscription: boolean;
  endpointHost: string;
  endpointFingerprint: string;
  expirationTime: string;
  p256dhPresent: boolean;
  authPresent: boolean;
  vapidFingerprint: string;
  standalone: boolean;
  userAgent: string;
  maxActions: number | null;
};

const emptyState: ClientState = {
  secureContext: false,
  notificationPermission: "desconocido",
  serviceWorkerController: false,
  serviceWorkerScope: "",
  serviceWorkerScript: "",
  serviceWorkerState: "no disponible",
  serviceWorkerFingerprint: "",
  pushManager: false,
  subscription: false,
  endpointHost: "",
  endpointFingerprint: "",
  expirationTime: "no indicada",
  p256dhPresent: false,
  authPresent: false,
  vapidFingerprint: "",
  standalone: false,
  userAgent: "",
  maxActions: null,
};

async function fingerprint(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const bytes = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function PushDiagnostics({ remoteSubscriptions }: { remoteSubscriptions: SafeSubscription[] }) {
  const [state, setState] = useState<ClientState>(emptyState);
  const [localTest, setLocalTest] = useState(" ");

  async function collectState(): Promise<ClientState> {
    const notificationApi = window.Notification as typeof Notification & { maxActions?: number } | undefined;
    const next = { ...emptyState, secureContext: window.isSecureContext, notificationPermission: notificationApi ? notificationApi.permission : "no disponible", pushManager: "PushManager" in window, standalone: window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)), userAgent: navigator.userAgent, maxActions: typeof notificationApi?.maxActions === "number" ? notificationApi.maxActions : null };
    if (!("serviceWorker" in navigator)) return next;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const script = await fetch("/sw.js", { cache: "no-store" }).then((response) => response.text()).catch(() => "");
    next.serviceWorkerController = Boolean(navigator.serviceWorker.controller);
    next.serviceWorkerScope = registration.scope;
    next.serviceWorkerScript = registration.active?.scriptURL ? new URL(registration.active.scriptURL).pathname : "/sw.js";
    next.serviceWorkerState = registration.active?.state || registration.waiting?.state || registration.installing?.state || "desconocido";
    next.serviceWorkerFingerprint = script ? await fingerprint(script) : "no disponible";
    const subscription = await registration.pushManager?.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      next.subscription = true;
      next.endpointHost = new URL(endpoint).host;
      next.endpointFingerprint = await fingerprint(endpoint);
      next.expirationTime = subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : "no indicada";
      next.p256dhPresent = Boolean(subscription.toJSON().keys?.p256dh);
      next.authPresent = Boolean(subscription.toJSON().keys?.auth);
      const applicationServerKey = (subscription.options as PushSubscriptionOptions & { applicationServerKey?: ArrayBuffer }).applicationServerKey;
      next.vapidFingerprint = applicationServerKey ? await fingerprint(applicationServerKey) : "no expuesta por navegador";
    }
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void collectState().then((next) => { if (!cancelled) setState(next); }).catch(() => { if (!cancelled) setState((current) => ({ ...current, serviceWorkerState: "error al inspeccionar" })); });
    return () => { cancelled = true; };
  }, []);

  async function showLocalNotification() {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Prueba local LeadFlow", { body: "Si ves esto, Android puede mostrar notificaciones locales.", tag: `leadflow-local-${Date.now()}`, icon: "/leadflow-mark.svg", badge: "/leadflow-mark.svg", data: { openUrl: "/dashboard" } });
      setLocalTest("Notificación local solicitada.");
    } catch {
      setLocalTest("No se pudo mostrar la notificación local.");
    }
  }

  const matched = state.endpointFingerprint ? remoteSubscriptions.find((subscription) => subscription.endpointFingerprint === state.endpointFingerprint) : undefined;

  return <main className="page-shell" style={{ maxWidth: 900 }}>
    <section className="section-heading"><p className="eyebrow">Diagnóstico temporal</p><h1>Recordatorios Push</h1><p className="muted">Esta pantalla muestra huellas y estados seguros para encontrar por qué un recordatorio no llega. Nunca muestra endpoints ni claves.</p></section>
    <section className="surface-card" style={{ display: "grid", gap: 12 }}>
      <h2>Estado de este dispositivo</h2>
      <dl className="diagnostics-grid">
        <dt>Conexión segura</dt><dd>{String(state.secureContext)}</dd>
        <dt>Permiso del navegador</dt><dd>{state.notificationPermission}</dd>
        <dt>App instalada / pantalla independiente</dt><dd>{String(state.standalone)}</dd>
        <dt>Service Worker</dt><dd>{state.serviceWorkerState} · {state.serviceWorkerScript || "no disponible"}</dd>
        <dt>Controla esta página</dt><dd>{String(state.serviceWorkerController)}</dd>
        <dt>Alcance</dt><dd>{state.serviceWorkerScope || "no disponible"}</dd>
        <dt>Huella del Service Worker</dt><dd>{state.serviceWorkerFingerprint || "no disponible"}</dd>
        <dt>Push disponible</dt><dd>{String(state.pushManager)}</dd>
        <dt>Suscripción actual</dt><dd>{state.subscription ? "Sí" : "No"}</dd>
        <dt>Proveedor (host)</dt><dd>{state.endpointHost || "no disponible"}</dd>
        <dt>Huella de suscripción</dt><dd>{state.endpointFingerprint || "no disponible"}</dd>
        <dt>Expiración</dt><dd>{state.expirationTime}</dd>
        <dt>Llaves de suscripción</dt><dd>p256dh: {String(state.p256dhPresent)} · auth: {String(state.authPresent)}</dd>
        <dt>Huella de clave pública</dt><dd>{state.vapidFingerprint || "no disponible"}</dd>
        <dt>Máximo de botones de notificación</dt><dd>{state.maxActions ?? "no indicado"}</dd>
      </dl>
      <button className="button-secondary" type="button" onClick={() => collectState().then(setState).catch(() => undefined)}>Volver a revisar</button>
      <button className="button-secondary" type="button" onClick={showLocalNotification}>Probar notificación local</button>
      {localTest.trim() && <p className="muted">{localTest}</p>}
    </section>
    <section className="surface-card" style={{ display: "grid", gap: 12 }}>
      <h2>Coincidencia remota</h2>
      <p className="muted">Se comparan sólo huellas. El proveedor conserva la suscripción, pero no se exponen sus datos secretos aquí.</p>
      <p><strong>{matched ? "La suscripción actual sí coincide con la base." : "La suscripción actual no coincide o todavía no existe en la base."}</strong></p>
      <div className="diagnostics-table" role="table" aria-label="Suscripciones remotas">
        {remoteSubscriptions.map((subscription) => <div className="diagnostics-row" role="row" key={subscription.id}><span>{subscription.endpointHost}</span><span>{subscription.endpointFingerprint}</span><span>{subscription.status} · gen {subscription.subscriptionGeneration}</span><span>claves: {String(subscription.p256dhPresent && subscription.authPresent)}</span></div>)}
      </div>
    </section>
    <section className="surface-card"><h2>Datos del navegador</h2><p className="muted" style={{ overflowWrap: "anywhere" }}>{state.userAgent || "no disponible"}</p></section>
  </main>;
}
