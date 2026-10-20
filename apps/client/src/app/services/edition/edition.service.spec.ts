import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditionService } from './edition.service';

describe('Edition Service ', () => {
  let service: EditionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EditionService],
    });
    service = TestBed.inject(EditionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
