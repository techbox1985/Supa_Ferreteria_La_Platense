import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Product } from '../types';

let ai: GoogleGenAI | null = null;

function getAiClient() {
  // Lazy initialization: create the client only when it's first needed.
  if (!ai) {
    // If the key is missing, the app won't crash on load. This function will throw an error
    // which will be caught by the calling function, providing a clear user message.
    // FIX: Per coding guidelines, API key must be sourced from process.env.API_KEY.
    if (!process.env.API_KEY) {
      // FIX: Updated error message to reflect the correct environment variable.
      throw new Error("La API Key (API_KEY) no está configurada en el entorno.");
    }
    // FIX: Per coding guidelines, initialize client directly with process.env.API_KEY using a named parameter.
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
}

export const generateProductDescription = async (product: Product): Promise<string> => {
  const prompt = `
    Eres un experto en marketing para una tienda de repuestos de refrigeración llamada "Refrigeración Tolosa".
    Genera una descripción de producto atractiva y profesional, de 2 a 3 frases, para el siguiente artículo.
    Enfócate en los beneficios y la calidad. No incluyas el precio.

    Producto: ${product.Producto}
    Categoría: ${product.Categoria}
    Subcategoría: ${product['Sub Categoria']}
    Descripción actual: ${product.Descripcion}

    Nueva descripción de marketing:
  `;

  try {
    const client = getAiClient(); // This will throw our custom error if the key is missing.
    const response: GenerateContentResponse = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 1,
        topK: 32,
        maxOutputTokens: 150,
        thinkingConfig: { thinkingBudget: 0 } // low latency
      }
    });

    return response.text?.trim() ?? "";
  } catch (error) {
    console.error("Error al generar descripción con Gemini:", error);
    // Return the error message to be displayed in the UI.
    return error instanceof Error ? error.message : "No se pudo generar la descripción en este momento.";
  }
};
