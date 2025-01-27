// api/checkFeatures.js
import axios from 'axios';

/**
 * Этот эндпоинт будем запускать по расписанию (cron) через Vercel
 * Он опрашивает Productboard и создает посты в Beamer
 */
export default async function handler(req, res) {
  try {
    // 1. Берём токены из переменных окружения (укажем их в Vercel)
    const PB_TOKEN = process.env.PB_TOKEN;         // Токен Productboard
    const BEAMER_TOKEN = process.env.BEAMER_TOKEN; // Токен Beamer

    if (!PB_TOKEN) {
      return res.status(500).json({ error: 'Missing PB_TOKEN env variable' });
    }
    if (!BEAMER_TOKEN) {
      return res.status(500).json({ error: 'Missing BEAMER_TOKEN env variable' });
    }

    // 2. Делаем GraphQL-запрос в Productboard
    // Пример: запрашиваем первые 10 фич (это упрощённый пример!)
    // В реальном проекте можно пагинировать и/или фильтровать. 
    const productboardResponse = await axios.post(
      'https://api.productboard.com/graphql',
      {
        query: `
          query {
            features(first: 10) {
              edges {
                node {
                  id
                  name
                  description
                  status {
                    id
                    name
                  }
                  updatedAt
                }
              }
            }
          }
        `,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PB_TOKEN}` // передаем токен PB
        },
      }
    );

    // 3. Достаём список фич
    const edges = productboardResponse.data?.data?.features?.edges || [];
    const allFeatures = edges.map((edge) => edge.node);

    // 4. Фильтруем фичи, у которых статус == "Released"
    //   (Проверяйте точное название статуса, как в Productboard!)
    const releasedFeatures = allFeatures.filter(
      (f) => f.status?.name === 'Released'
    );

    // --------------------
    // ВАЖНО О ДУБЛИКАТАХ:
    // Сейчас при каждом запуске мы снова "создаем" пост в Beamer
    // для всех Released-фич. Это может быть дублировано.
    //
    // Для продакшена нужен способ "помнить", какие ID фич мы уже выложили.
    // Можно хранить их в БД, или метить фичи в PB кастомным полем.
    // Здесь, чтобы не усложнять, публикуем все Released при каждом запуске.
    // --------------------

    // 5. Для каждой Released-фичи шлём POST в Beamer
    for (const feature of releasedFeatures) {
      await axios.post(
        'https://app.getbeamer.com/v0/posts',
        {
          title: feature.name || 'Released Feature',
          content: feature.description || 'No description',
          publishNow: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BEAMER_TOKEN}`
          }
        }
      );

      console.log(`Beamer post created for feature ID: ${feature.id}`);
    }

    // 6. Ответим JSON
    return res.status(200).json({
      message: 'Check completed',
      foundReleased: releasedFeatures.length
    });
  } catch (err) {
    console.error('Error in checkFeatures:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
