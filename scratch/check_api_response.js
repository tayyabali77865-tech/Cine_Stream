async function checkApiResponse() {
  try {
    const slug = 'movie-110007';
    const detailsRes = await fetch(`https://api2.imdb3.shop/api/movie/110007`);
    const details = await detailsRes.json();
    console.log(JSON.stringify(details, null, 2));
  } catch (err) {
    console.error(err);
  }
}

checkApiResponse();
