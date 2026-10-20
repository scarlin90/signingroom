import { ComponentFixture, TestBed } from '@angular/core/testing';

describe('EditionBannerComponent', () => {
  let component: EditionBannerComponent;
  let fixture: ComponentFixture<EditionBannerComponent>;

  beforeEach(async () => {

    await TestBed.configureTestingModule({
      imports: [EditionBannerComponent],
      providers: [],
    })
      .compileComponents();

    fixture = TestBed.createComponent(EditionBannerComponent);
    component = fixture.componentInstance;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization and Context', () => {
    });
});