export function validatePickupEvent(eventName: string): string | null {
  return eventName.trim() ? null : "Informe o evento em que deseja retirar o pedido.";
}