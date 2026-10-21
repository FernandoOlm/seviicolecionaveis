import { describe, expect, it } from "vitest";
import { validatePickupEvent } from "./checkout-pickup";

describe("retirada em eventos no checkout", () => {
  it("exige o nome do evento", () => {
    expect(validatePickupEvent("")).not.toBeNull();
    expect(validatePickupEvent("   ")).not.toBeNull();
    expect(validatePickupEvent("Encontro Pokémon TCG - Praça X")).toBeNull();
  });
});