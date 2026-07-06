// Valid Transformers.js object-detection models (public, no auth required):
// - Xenova/yolos-tiny      (~20MB, best mobile balance)
// - Xenova/detr-resnet-50  (~160MB, most accurate, slow on phones)
// NOTE: Xenova/ssd-mobilenet-v1 does NOT exist on the Hub (returns 401).
export const DETECTION_MODEL = 'Xenova/yolos-tiny';
export const DETECTION_MODEL_LABEL = 'YOLOS TINY';
