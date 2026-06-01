import { TestBed } from '@angular/core/testing';
import { WidgetDispatcherService } from './widget-dispatcher.service';

describe('WidgetDispatcherService', () => {
  let service: WidgetDispatcherService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WidgetDispatcherService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});