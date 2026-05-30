/**
 * Stubbed mobility handlers — return realistic mock data until
 * real Swing/mobility API keys are available.
 *
 * Supported operations:
 *   mobility.taxi.search    → nearby taxi results
 *   mobility.taxi.estimate  → fare estimate
 *   mobility.pm.nearby      → nearby PM scooters/kickboards
 *   mobility.pm.unlock      → unlock result
 */

export interface MobilityResult {
  readonly _stub: true;
  readonly service: string;
  readonly action: string;
  readonly data: unknown;
}

/**
 * Execute a stubbed mobility operation.
 *
 * @param service - e.g. "taxi", "pm"
 * @param action  - e.g. "search", "estimate", "nearby", "unlock"
 * @param params  - operation parameters (used for realistic mock variation)
 * @throws If the service/action combination is not implemented
 */
export async function executeMobility(
  service: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<MobilityResult> {
  const key = `${service}.${action}`;

  switch (key) {
    case 'taxi.search':
      return {
        _stub: true,
        service,
        action,
        data: {
          results: [
            {
              id: 'taxi-001',
              provider: 'Swing',
              driverName: '김영수',
              carType: '소나타 (흰색)',
              plateNumber: '서울 12가 3456',
              etaMinutes: 4,
              estimatedFare: 12_000,
              currency: 'KRW',
              rating: 4.8,
            },
            {
              id: 'taxi-002',
              provider: 'Swing',
              driverName: '박민호',
              carType: '아반떼 (검정)',
              plateNumber: '서울 34나 7890',
              etaMinutes: 7,
              estimatedFare: 11_500,
              currency: 'KRW',
              rating: 4.6,
            },
            {
              id: 'taxi-003',
              provider: 'Swing Premium',
              driverName: '이준혁',
              carType: '제네시스 G80 (검정)',
              plateNumber: '서울 56다 1234',
              etaMinutes: 9,
              estimatedFare: 22_000,
              currency: 'KRW',
              rating: 4.9,
            },
          ],
          searchedAt: new Date().toISOString(),
          from: params?.from ?? '$currentLocation',
          to: params?.to ?? null,
        },
      };

    case 'taxi.estimate':
      return {
        _stub: true,
        service,
        action,
        data: {
          from: params?.from ?? '$currentLocation',
          to: params?.to ?? '$home',
          estimates: [
            {
              type: '일반',
              fareRange: { min: 10_000, max: 14_000 },
              etaMinutes: { min: 15, max: 25 },
              currency: 'KRW',
            },
            {
              type: '프리미엄',
              fareRange: { min: 20_000, max: 28_000 },
              etaMinutes: { min: 15, max: 25 },
              currency: 'KRW',
            },
          ],
          estimatedAt: new Date().toISOString(),
        },
      };

    case 'pm.nearby':
      return {
        _stub: true,
        service,
        action,
        data: {
          results: [
            {
              id: 'pm-001',
              type: 'kickboard',
              provider: 'Swing',
              lat: 37.4979,
              lng: 127.0276,
              batteryPercent: 78,
              distanceMeters: 120,
              pricePerMinute: 150,
              currency: 'KRW',
              unlockFee: 1_000,
            },
            {
              id: 'pm-002',
              type: 'kickboard',
              provider: 'Swing',
              lat: 37.4985,
              lng: 127.0281,
              batteryPercent: 45,
              distanceMeters: 230,
              pricePerMinute: 150,
              currency: 'KRW',
              unlockFee: 1_000,
            },
            {
              id: 'pm-003',
              type: 'ebike',
              provider: 'Swing',
              lat: 37.4972,
              lng: 127.0269,
              batteryPercent: 92,
              distanceMeters: 85,
              pricePerMinute: 200,
              currency: 'KRW',
              unlockFee: 1_000,
            },
          ],
          searchedAt: new Date().toISOString(),
          center: {
            lat: params?.lat ?? 37.498,
            lng: params?.lng ?? 127.0275,
          },
          radiusMeters: params?.radius ?? 500,
        },
      };

    case 'pm.unlock':
      return {
        _stub: true,
        service,
        action,
        data: {
          vehicleId: params?.vehicleId ?? 'pm-001',
          unlocked: true,
          startedAt: new Date().toISOString(),
          unlockFee: 1_000,
          pricePerMinute: 150,
          currency: 'KRW',
          message: '킥보드가 잠금 해제되었습니다. 안전 운행하세요!',
        },
      };

    default:
      throw new Error(
        `Mobility operation "${key}" is not implemented. ` +
        `Available: taxi.search, taxi.estimate, pm.nearby, pm.unlock`,
      );
  }
}
