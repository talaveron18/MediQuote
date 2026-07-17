# Arquitectura

```mermaid
flowchart TD
  U["Usuario"] --> UI["Capa AI Review"]
  UI --> API["API autenticada"]
  API --> P{"Proveedor"}
  P --> D["Demo determinista"]
  P --> O["OpenAI estructurado"]
  D --> V["Veredicto + fiscal"]
  O --> V
  M["Motor MediQuote inmutable"] -. "solo foto" .-> API
```

La ruta `/api/ai-review` es de servidor, requiere sesión y acepta acciones tipadas. El proveedor demo es el predeterminado. El proveedor OpenAI usa salidas estructuradas, `store:false`, límite de tiempo y un reintento.
