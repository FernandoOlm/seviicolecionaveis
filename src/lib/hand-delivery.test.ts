import { describe, it, expect } from "vitest";
import { isHandDeliveryArea, isHandDeliveryFeePaid, handDeliveryFeeLabel } from "./hand-delivery";

describe("área da Entrega em mãos", () => {
  it("aceita Aracaju/SE com variações de escrita", () => {
    expect(isHandDeliveryArea({ city: "aracaju", state: "se" })).toBe(true);
    expect(isHandDeliveryArea({ city: "  ARACAJU ", state: "SE" })).toBe(true);
    expect(isHandDeliveryArea({ city: "Aracajú", state: "Se", cep: "49037-320" })).toBe(true);
  });
  it("recusa outras cidades ou estados", () => {
    expect(isHandDeliveryArea({ city: "São Cristóvão", state: "SE" })).toBe(false);
    expect(isHandDeliveryArea({ city: "Aracaju", state: "BA" })).toBe(false);
    expect(isHandDeliveryArea({ city: "", state: "SE" })).toBe(false);
    expect(isHandDeliveryArea(null)).toBe(false);
  });
  it("recusa CEP fora de Aracaju", () => {
    expect(isHandDeliveryArea({ city: "Aracaju", state: "SE", cep: "49100-000" })).toBe(false);
  });
});

describe("status do pagamento da taxa", () => {
  it("confirmado e pago (antigo) contam como pago", () => {
    expect(isHandDeliveryFeePaid("confirmed")).toBe(true);
    expect(isHandDeliveryFeePaid("paid")).toBe(true);
    expect(isHandDeliveryFeePaid("pending")).toBe(false);
    expect(handDeliveryFeeLabel(null)).toBe("Aguardando confirmação");
  });
});
