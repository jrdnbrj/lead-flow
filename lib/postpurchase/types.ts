export const postPurchaseMilestones = [
  { type: "INVOICED", position: 1, label: "Facturado" },
  { type: "FONDO_VIAL", position: 2, label: "Fondo vial" },
  { type: "RAMV_REQUESTED", position: 3, label: "RAMV solicitado" },
  { type: "RAMV_UPLOADED", position: 4, label: "RAMV cargado" },
  { type: "ORDERS_AVAILABLE", position: 5, label: "Órdenes disponibles" },
  { type: "ORDERS_SENT", position: 6, label: "Órdenes enviadas" },
  { type: "PAYMENTS_RECEIVED", position: 7, label: "Pagos recibidos" },
  { type: "SENT_TO_REGISTRATION", position: 8, label: "Enviado a matricular" },
  { type: "REGISTERED", position: 9, label: "Matriculado" },
  { type: "ACCESSORIES_COMPLETE", position: 10, label: "Accesorios completos" },
  { type: "VEHICLE_REQUESTED", position: 11, label: "Vehículo solicitado" },
  { type: "DELIVERY_PREPARATION", position: 12, label: "Preparación para entrega" },
  { type: "DELIVERED", position: 13, label: "Entregado" },
] as const;

export type PostPurchaseMilestoneType = (typeof postPurchaseMilestones)[number]["type"];
export type PostPurchaseMilestoneStatus = "PENDING" | "COMPLETED" | "REVERTED";
export type PostPurchasePurchaseStatus = "PURCHASED" | "REVERTED";
export type PostPurchaseCaseStatus = "READY" | "NOT_CREATED" | "PAUSED" | "NOT_PURCHASED";

export interface PostPurchaseCase {
  id: string;
  leadId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface PostPurchaseMilestone {
  id: string;
  purchaseCaseId: string;
  milestoneType: PostPurchaseMilestoneType;
  position: number;
  status: PostPurchaseMilestoneStatus;
  completedAt: string | null;
  completedBy: string | null;
  revertedAt: string | null;
  revertedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostPurchaseCaseReadModel {
  status: PostPurchaseCaseStatus;
  purchaseStatus: PostPurchasePurchaseStatus | null;
  case: PostPurchaseCase | null;
  milestones: PostPurchaseMilestone[];
  completedCount: number;
  total: 13;
}
