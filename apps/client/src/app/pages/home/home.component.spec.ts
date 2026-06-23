import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HomeComponent } from './home.component';
import { vi } from 'vitest';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('toggleFullscreen', () => {
    it('should request fullscreen on the element if not currently in fullscreen', () => {
      // Mock document.fullscreenElement to be null (not in fullscreen)
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      
      const mockElement = {
        requestFullscreen: vi.fn().mockResolvedValue(undefined)
      } as unknown as HTMLElement;

      component.toggleFullscreen(mockElement);
      
      expect(mockElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should log an error if requesting fullscreen fails', async () => {
      // Mock document.fullscreenElement to be null
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      
      const mockError = new Error('API not supported');
      mockError.name = 'NotSupportedError';
      
      const mockElement = {
        requestFullscreen: vi.fn().mockRejectedValue(mockError)
      } as unknown as HTMLElement;
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      component.toggleFullscreen(mockElement);
      
      await Promise.resolve(); 

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error enabling fullscreen: API not supported'
      );
    });

    it('should exit fullscreen if document is currently in fullscreen', () => {
      // Mock document.fullscreenElement to simulate already being in fullscreen
      Object.defineProperty(document, 'fullscreenElement', { value: document.createElement('div'), configurable: true });
      document.exitFullscreen = vi.fn().mockResolvedValue(undefined);

      component.toggleFullscreen(document.createElement('div'));
      
      expect(document.exitFullscreen).toHaveBeenCalled();
    });
  });
});