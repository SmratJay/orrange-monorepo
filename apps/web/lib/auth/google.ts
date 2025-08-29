import { OAuth2Client } from 'google-auth-library';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export class GoogleAuth {
  private static client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  static getAuthUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      state,
    });
  }

  static async verifyToken(token: string): Promise<GoogleUser> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Invalid token payload');
      
      return {
        id: payload.sub!,
        email: payload.email!,
        name: payload.name!,
        picture: payload.picture,
        emailVerified: !!payload.email_verified,
      };
    } catch (error) {
      throw new Error('Invalid Google token');
    }
  }

  static async exchangeCode(code: string) {
    const { tokens } = await this.client.getToken(code);
    return tokens;
  }
}
