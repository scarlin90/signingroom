import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UrService } from './ur.service';

describe('UrService', () => {
 
  beforeEach(() => {
    

    TestBed.configureTestingModule({
      imports: [],
      providers: [
      ]
    });

    const service = TestBed.inject(UrService);
    
  });

  afterEach(() => {

  });

  describe('Test', () => {
    it('should', async () => {

    });
  });

});