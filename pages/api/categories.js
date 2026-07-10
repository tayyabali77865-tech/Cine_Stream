const CATEGORIES = [
  { name: "Trending", slug: "trending" },
  { name: "Bollywood", slug: "bollywood" },
  { name: "South Hindi", slug: "south-hindi" },
  { name: "Hollywood", slug: "hollywood" },
  { name: "Anime", slug: "anime" },
  { name: "K-Drama", slug: "k-drama" },
  { name: "C-Drama", slug: "c-drama" },
  { name: "Reality TV", slug: "reality-tv" },
  { name: "Action Movies", slug: "action" },
  { name: "Romantic Movies", slug: "romance" },
  { name: "Horror Movies", slug: "horror" }
];

export default async function handler(req, res) {
  // Categories are completely static — cache aggressively at browser and CDN level
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).json({
    success: true,
    count: CATEGORIES.length,
    data: CATEGORIES
  });
};

