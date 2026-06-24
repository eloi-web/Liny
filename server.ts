import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit to handle base64 image data from high-resolution webcams
  app.use(express.json({ limit: "15mb" }));

  // API endpoint for Quantum Multimodal Scanner (using secure server-side Gemini 2.5 Flash)
  app.post("/api/scan", async (req, res) => {
    try {
      const { image, currentLabels } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image payload detected." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "GEMINI_API_KEY is not configured. Please add your Gemini API Key in the Google AI Studio Settings menu to unlock high-fidelity neural scanning."
        });
      }

      // Extract raw base64 data from the data URI (e.g. data:image/jpeg;base64,...)
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      let mimeType = "image/jpeg";
      let base64Data = image;

      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Data = matches[2];
      }

      // Initialize GoogleGenAI client lazily to prevent server crashes if the key is missing
      const ai = new GoogleGenAI({ apiKey });

      const labelsContext = currentLabels && currentLabels.length > 0 
        ? `The real-time local edge detector noticed: ${currentLabels.join(", ")}.` 
        : "";

      const prompt = `You are the core computer system of Liny, an advanced Quantum AI Multimodal Scanner. 
Your goal is to perform a deep spectral and molecular analysis of the primary object or scene captured in this camera frame.

${labelsContext}

Analyze the primary, centered object (or overall scene if nothing is centered) and return a structured JSON response. 

Return your response in exactly this JSON format (do not wrap in markdown or any other text, just the raw JSON structure):
{
  "name": "Identified Object Name",
  "sciFiClassification": "Scientific/Cybernetic Category (e.g. ORGANIC CARBON MATRIX, METALLIC CHASSIS, OPTICAL TRANSCEIVER)",
  "description": "A high-fidelity analysis of the object, describing what it is, its physical qualities, and real-world utility.",
  "attributes": [
    { "label": "Estimated Composition", "value": "A realistic estimation of materials (e.g. 60% Alumina Glass, 40% Polycarbonate)" },
    { "label": "Energy Signature", "value": "Description of passive energy emitted (e.g. Low Thermal / Stable RF Field)" },
    { "label": "Structural State", "value": "State of the object (e.g. Intact / Static Equilibrium)" },
    { "label": "Safety Class", "value": "Safety tier (e.g. Minimal Risk / Class-1 Utility)" }
  ],
  "technicalSpecs": {
    "temperature": "Ambient (24.5°C) or reasonable estimation",
    "spectralSignature": "Custom technical signature tag (e.g. PEAK-REFLECTIVE-GLASS)",
    "integrity": "Estimated durability score (e.g. 98.4% Nominal)"
  },
  "trivia": "A cool, clever, or engaging detail or historical lore about this item in modern daily life."
}

Ensure the analysis is highly professional, clean, engaging, and fits a high-tech/clean interface.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          prompt
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || "";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText.trim());
      } catch (jsonErr) {
        console.error("Failed to parse Gemini response as JSON:", responseText);
        // Fallback in case parsing fails
        parsedData = {
          name: "Complex Matrix",
          sciFiClassification: "UNRESOLVED SPECTRAL SIGNATURE",
          description: "An intricate object or scene that is currently undergoing quantum interference. " + responseText.substring(0, 200),
          attributes: [
            { "label": "Composition", "value": "Unresolved spectral elements" },
            { "label": "Energy Signature", "value": "Fluctuating thermal state" },
            { "label": "Structural State", "value": "Dynamic" },
            { "label": "Safety Class", "value": "Class-0 Unverified" }
          ],
          technicalSpecs: {
            temperature: "Unknown",
            spectralSignature: "QUANTUM-INTERFERENCE-88",
            integrity: "99.9% Nominal"
          },
          trivia: "This target requires stable focus to scan thoroughly."
        };
      }

      return res.json(parsedData);
    } catch (error: any) {
      console.error("Quantum Scan Error:", error);
      return res.status(500).json({
        error: error.message || "The quantum scanner failed to compute the spectral signature of the target."
      });
    }
  });

  // Handle Vite integration based on environment
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Liny Server running on http://localhost:${PORT}`);
  });
}

startServer();
