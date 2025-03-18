const formatGoogleUserData = (profile) => {
  return {
    email: profile.emails && profile.emails[0] ? profile.emails[0].value : "",
    firstName: profile.name ? profile.name.givenName : "",
    lastName: profile.name ? profile.name.familyName : "",
    authProvider: "google",
    authProviderId: profile.id,
    picture:
      profile.photos && profile.photos[0] ? profile.photos[0].value : null,
  };
};

const formatMicrosoftUserData = (profile) => {
  return {
    email: profile.emails && profile.emails[0] ? profile.emails[0].value : "",
    firstName: profile.name ? profile.name.givenName : "",
    lastName: profile.name ? profile.name.familyName : "",
    authProvider: "outlook",
    authProviderId: profile.id,
    picture: null,
  };
};

// Get tenant ID from OAuth state
const getTenantIdFromState = (state) => {
  try {
    return state;
  } catch (error) {
    throw new Error("Invalid OAuth state parameter");
  }
};

const oauthRedirect = (tokens, provider, error = null) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (error) {
      return `${frontendUrl}/auth/callback?error=${encodeURIComponent(error)}`;
    }

    const { accessToken, refreshToken } = tokens;
    const queryParams = new URLSearchParams({
      accessToken,
      refreshToken,
      provider,
    }).toString();

    return `${frontendUrl}/auth/callback?${queryParams}`;
  } catch (error) {
    console.error("OAuth redirect error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return `${frontendUrl}/auth/callback?error=${encodeURIComponent(
      "Authentication failed"
    )}`;
  }
};

// Validate tokens
const validateTokenWithProvider = async (provider, token) => {
  try {
    if (provider === "google") {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
      );
      return response.ok;
    } else if (provider === "outlook") {
      const response = await fetch(`https://graph.microsoft.com/v1.0/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.ok;
    }

    return false;
  } catch (error) {
    console.error(`Error validating ${provider} token:`, error);
    return false;
  }
};

module.exports = {
  formatGoogleUserData,
  formatMicrosoftUserData,
  getTenantIdFromState,
  oauthRedirect,
  validateTokenWithProvider,
};
