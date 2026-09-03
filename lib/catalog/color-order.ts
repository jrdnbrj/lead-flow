type CatalogColorOrderable = {
  slug: string;
  sort_order: number;
  name: string;
};

const colorOrder = [
  "blanco",
  "negro",
  "gris",
  "plateado",
  "plata",
  "rojo",
  "azul",
  "celeste",
  "verde",
  "naranja",
  "plateado-mate",
  "plata-mate",
  "plata-silver",
  "gris-plateado",
];

function colorOrderIndex(color: CatalogColorOrderable): number {
  const index = colorOrder.indexOf(color.slug);
  return index >= 0 ? index : colorOrder.length;
}

export function orderCatalogColors<T extends CatalogColorOrderable>(colors: T[]): T[] {
  return [...colors].sort((left, right) => colorOrderIndex(left) - colorOrderIndex(right) || left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"));
}
