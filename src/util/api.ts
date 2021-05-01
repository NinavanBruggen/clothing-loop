const getUserLocation = (accessToken: string) => {
  return fetch(`https://ipinfo.io/json?token=${accessToken}`)
    .then((response) => {
      return response.json();
    })
};

export default getUserLocation;