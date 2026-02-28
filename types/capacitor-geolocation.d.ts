declare module "@capacitor/geolocation" {
  export const Geolocation: {
    getCurrentPosition(options?: { timeout?: number }): Promise<{
      coords: {
        latitude: number;
        longitude: number;
      };
    }>;
  };
}
