import { BW6IconRegistry } from '../../bw6-icons';

let _iconRegistry: BW6IconRegistry | undefined;

export function setIconRegistry(r: BW6IconRegistry | undefined): void {
  _iconRegistry = r;
}

export function getIconRegistry(): BW6IconRegistry | undefined {
  return _iconRegistry;
}
