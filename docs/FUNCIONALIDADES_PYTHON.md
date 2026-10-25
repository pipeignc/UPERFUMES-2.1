# Tres funcionalidades en Python

Se agregó un servicio FastAPI que puede funcionar solo y un adaptador para
montarlo en Express bajo `/asesor/`. Los cálculos y decisiones de las tres
funcionalidades se ejecutan en Python. JavaScript presenta formularios y resultados.

| Funcionalidad | Paradigma principal | Dónde demostrarlo |
| --- | --- | --- |
| Recomendador ML | Imperativo | `python_service/imperative.py`: secuencia de lectura, validación, entrenamiento, evaluación e inferencia; bucles y acumulación de resultados. |
| Chatbot local | Orientado a objetos | `python_service/chatbot.py`: `KnowledgeEntry` abstracta, `FAQ` y `PerfumeEntry` polimórficas, composición de `KnowledgeIndex` con `PerfumeChatbot`, estado encapsulado. |
| Comparador por presupuesto | Funcional | `python_service/functional.py`: funciones puras, composición de `filter`, `map`, `sorted`, retorno de nuevas colecciones y ausencia de efectos secundarios. |

Los paradigmas no son exclusivos de todo Python: sklearn ofrece una API de
objetos, y FastAPI usa clases para validar HTTP. La asignación se refiere a la
lógica propia de cada funcionalidad, que se puede explicar y probar por separado.

## Ejecutar

Requisitos: Python 3.12 y Node >=22.22 para las pruebas de interfaz (validado
con Python 3.12.14 y Node 24.19.0). Desde la raíz del repositorio:

```bash
npm ci
bash scripts/setup-python.sh
npm run python:dev
```

El servicio escucha en el puerto local 8000 y su pantalla está en la ruta `/`.
El servidor debe seguir ejecutándose mientras usas el asesor. Para desarrollo
con recarga automática: `.venv/bin/python -m uvicorn python_service.app:app --reload`.
Los comandos npm de Python están pensados para Linux/macOS; en Windows usa
`.venv\Scripts\python` como intérprete equivalente.

```bash
npm run test:python
npm run test:python-ui
```

La segunda suite inicia un servicio Python real y un Express temporal, carga
la pantalla con jsdom y envía sus formularios a los endpoints reales. No necesita
que el servidor de desarrollo esté abierto. Las pruebas Python requieren haber
entrenado el modelo; no sustituyen el dataset por recomendaciones ficticias.

## Modelo y datos

- El archivo entregado como `DATASET_PROTOTIPO.xls` es CSV UTF-8 con BOM. Se
  conserva su contenido como `python_service/data/DATASET_PROTOTIPO.csv`.
- El cuaderno original está en `notebooks/MODELO_PERFUMES_PROT.ipynb`. Se conserva
  como referencia; no se ejecutan sus instalaciones ni gráficos al arrancar la web.
- Dataset verificado: **9.911 registros y 236 perfumes**, sin valores vacíos ni
  duplicados exactos. Algunas celdas de texto del notebook dicen 50 perfumes;
  los datos y sus salidas ejecutadas muestran 236.
- Features en orden: `Edad`, `Clima_Cod`, `Ocasion_Cod`, `Presupuesto_USD`,
  `Genero_Cod`. Género del dataset: 1 Masculino, 2 Femenino, 3 Unisex. La interfaz
  envía etiquetas para evitar la confusión con 0/1 de algunos ejemplos del cuaderno.
- Se reproduce el ganador del GridSearch registrado: Random Forest, 300 árboles,
  profundidad máxima 12, `min_samples_split=4`, semilla 42. Dos hilos limitan
  consumo de recursos. No se repite la búsqueda de 120 entrenamientos.
- Split estratificado 80/20: 7.928 filas para entrenar, 1.983 para evaluación.
  El modelo servido conserva ese entrenamiento, sin incorporar el conjunto de prueba.
- Métricas obtenidas con los datos originales: accuracy **0,3671205**, F1 ponderado
  **0,3596874**, top-3 accuracy **0,6369138**. Coinciden con las salidas del cuaderno.
  El puntaje de cada recomendación no es una garantía ni una probabilidad calibrada.
- Artefacto generado e ignorado por Git: `python_service/artifacts/perfumes.joblib`.
  Incluye modelo, precios, métricas, versión de sklearn y SHA-256 del CSV.
  Solo cargar artefactos generados localmente y de confianza: joblib no es un
  formato seguro para archivos arbitrarios. No hay un endpoint para subir modelos.
- `PERFUME_MODEL_PATH` permite seleccionar otro artefacto local. Reinicia el
  servicio después de reentrenar. Si falta o es inválido, los endpoints que lo
  requieren devuelven 503 y el chatbot conserva sus preguntas generales.

## Conversión de precios

El presupuesto llega en CLP y se divide por la tasa antes de predecir. El precio
mostrado se obtiene de `Precio_Real_USD`, **no** de `Presupuesto_USD`, y se multiplica
por esa misma tasa. Se usa `Decimal` y redondeo `ROUND_HALF_UP` al peso más cercano.
Si un futuro dataset contiene varios precios por nombre, se usa la mediana.

La interfaz comienza con **950 CLP/USD como ejemplo explícito y editable**.
No consulta un tipo de cambio en vivo. Cada resultado indica la tasa utilizada.
Ejemplo: 105 USD × 950 = **$99.750 CLP** para Sauvage EDP.

Los precios son referencias del dataset; no confirman disponibilidad en la tienda
ni indican tamaño de frasco. No deben confundirse con los precios de decants del
catálogo comercial. Las recomendaciones pueden superar el presupuesto (lo informa
la tarjeta), porque el modelo lo utiliza como una variable predictora. El comparador
sí filtra estrictamente por el presupuesto al peso redondeado.

## Chatbot sin claves

Se usa un índice aprendido de texto **TF-IDF + similitud coseno**, junto con
identificación de nombres para evitar asignar un precio a un perfume desconocido.
Recupera respuestas de la guía del proyecto y fichas de los 236 perfumes. Es un
asistente de recuperación local, **no un LLM generativo**. No hace llamadas a APIs,
no solicita claves y no tiene costo por conversación. Cuando no sabe, lo indica.

El historial vive en memoria de la pestaña y se envían como máximo 8 mensajes para
resolver preguntas breves como «¿y su precio?». El servidor no persiste mensajes.
No consulta pedidos, procesa pagos ni afirma políticas de despacho no documentadas.

## Integración con la tienda Express

La tienda sirve la pantalla integrada en `/asesor.html`. Los accesos del encabezado
y del HUB abren `#recommend`, `#chat` y `#compare` directamente. `/asesor/` redirige
a esa pantalla. Se conserva el recomendador de reglas del catálogo original.

`src/app.js` monta el adaptador Express antes de los archivos estáticos. Las API
se consumen bajo `/asesor/api/`, en el mismo origen que la tienda. El servicio
Python debe correr en paralelo con Node (puerto 8000 por defecto). Puede configurarse
`PERFUME_SERVICE_URL` en el proceso Node para otro destino administrado.

La pantalla usa `public/styles.css`, sus variables de color y fuentes, `cart.js`
y `script.js` para conservar el carrito, tema e idiomas del HUB. Sus estilos
específicos están aislados en `public/advisor.css`. El contenido de asesoría y
las respuestas del chatbot se ofrecen en español; los controles compartidos
conservan los tres idiomas de la tienda.

Los perfumes externos del dataset no reciben IDs de carrito: el modelo no
confirma stock ni equivalencia con los decants del catálogo comercial.

Ejemplo de perfil enviado a `POST /asesor/api/recommendations`:

```json
{
  "age": 19,
  "climate": "Frío",
  "occasion": "Oficina/Trabajo",
  "gender": "Masculino",
  "budget_clp": 142500,
  "rate": "950"
}
```

## API

| Ruta en Python | Uso |
| --- | --- |
| `GET /api/health` | Estado del servicio, modelo y cantidad de perfumes. |
| `GET /api/options` | Etiquetas válidas de clima, ocasión y género. |
| `POST /api/recommendations` | Perfil anterior; devuelve nombre, precio CLP, puntaje y relación con presupuesto. |
| `POST /api/compare` | `budget_clp`, `rate`, `query` opcional, `limit` opcional (1–50). |
| `POST /api/chat` | `message`, `history` opcional y `rate` opcional; devuelve respuesta, fuente y modo local. |

Ejecutar el servicio Python y entrenar el modelo no despliega la tienda ni habilita
pagos reales. `npm start` inicia la tienda; `npm run python:dev` inicia el asesor.
`npm test` valida compras con SQLite temporal y Webpay simulado.
`npm run test:python-ui` valida la página integrada con Express y Python reales,
incluidos tema, idioma y enlaces directos, usando otra base temporal.
