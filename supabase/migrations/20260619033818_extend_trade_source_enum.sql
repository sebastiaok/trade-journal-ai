-- trade_source ENUM 확장: 보유 스냅샷(opening)과 API 연동(api) 지원
ALTER TYPE trade_source ADD VALUE IF NOT EXISTS 'opening';
ALTER TYPE trade_source ADD VALUE IF NOT EXISTS 'api';
