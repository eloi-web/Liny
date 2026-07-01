import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;

async function run() {
  const detector = await pipeline('object-detection', 'Xenova/detr-resnet-50');
  const res = await detector('https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?auto=format&fit=crop&w=300&q=80', { threshold: 0.5 });
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
