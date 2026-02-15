import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/uiStore';
import { useFeedStore } from '@/stores/feedStore';
import { useGenres, useProviders, useCertifications, useCountries, useSearch } from '@/api/hooks';
import Chip from '@/components/ui/Chip';
import RangeSlider from '@/components/ui/RangeSlider';
import Button from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import Spinner from '@/components/ui/Spinner';
import type { FeedFilters } from '@/types';

export default function FilterDrawer() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.filterDrawerOpen);
  const close = () => useUIStore.getState().setFilterDrawerOpen(false);
  const currentFilters = useFeedStore((s) => s.activeFilters);
  const contentType = useFeedStore((s) => s.contentType);
  const setFilters = useFeedStore((s) => s.setFilters);
  const isAnimation = contentType === 'animation';
  const isSeries = contentType === 'series';

  const { data: genresData, isLoading: genresLoading } = useGenres();
  const { data: providersData } = useProviders();
  const { data: certsData } = useCertifications();
  const { data: countriesData } = useCountries();

  const [local, setLocal] = useState<FeedFilters>({});
  const [personSearch, setPersonSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null);
  const [countrySearch, setCountrySearch] = useState('');

  const { data: personResults } = useSearch(personSearch, 'person');

  useEffect(() => {
    if (open) {
      setLocal({ ...currentFilters });
      if (!currentFilters.personId) {
        setSelectedPerson(null);
        setPersonSearch('');
      }
    }
  }, [open, currentFilters]);

  const toggleGenre = (id: number) => {
    const current = local.genres || [];
    setLocal({
      ...local,
      genres: current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    });
  };

  const toggleProvider = (id: number) => {
    const current = local.providers || [];
    setLocal({
      ...local,
      providers: current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    });
  };

  const toggleCertification = (cert: string) => {
    const current = local.certification || [];
    setLocal({
      ...local,
      certification: current.includes(cert) ? current.filter((c) => c !== cert) : [...current, cert],
    });
  };

  const toggleCountry = (code: string) => {
    const current = local.countries || [];
    setLocal({
      ...local,
      countries: current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    });
  };

  const filteredCountries = countriesData?.countries.filter((c) =>
    countrySearch ? c.code.toLowerCase().includes(countrySearch.toLowerCase()) || c.name.toLowerCase().includes(countrySearch.toLowerCase()) : true,
  ) ?? [];

  const handleApply = () => {
    setFilters(local);
    close();
  };

  const handleReset = () => {
    setLocal({});
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            className="fixed z-50 inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 md:w-[28rem]"
            initial={{ y: '100%', x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: '100%', x: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <div className="bg-surface rounded-t-lg md:rounded-none h-[85vh] md:h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-base font-semibold">{t('filters.title')}</h2>
                <button onClick={close} className="p-1 text-text-muted hover:text-text">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                {/* Genres */}
                <section>
                  <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {t('filters.genres')}
                  </h3>
                  {genresLoading ? (
                    <Spinner size={20} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {genresData?.genres.map((g) => (
                        <Chip
                          key={g.id}
                          label={g.name}
                          emoji={g.emoji}
                          selected={local.genres?.includes(g.id) ?? false}
                          onClick={() => toggleGenre(g.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* Year range */}
                <section>
                  <RangeSlider
                    label={t('filters.year')}
                    min={1970}
                    max={2026}
                    value={[local.yearMin ?? 1990, local.yearMax ?? 2026]}
                    onChange={([yearMin, yearMax]) => setLocal({ ...local, yearMin, yearMax })}
                  />
                </section>

                {/* Rating range */}
                <section>
                  <RangeSlider
                    label={t('filters.rating')}
                    min={0}
                    max={10}
                    step={0.5}
                    value={[local.ratingMin ?? 6.5, local.ratingMax ?? 10]}
                    onChange={([ratingMin, ratingMax]) => setLocal({ ...local, ratingMin, ratingMax })}
                    formatValue={(v) => v.toFixed(1)}
                  />
                </section>

                {/* Duration (not for series — runtime is per episode) */}
                {!isSeries && (
                  <section>
                    <RangeSlider
                      label={t('filters.duration')}
                      min={0}
                      max={300}
                      step={10}
                      value={[local.runtimeMin ?? (isAnimation ? 60 : 80), local.runtimeMax ?? (isAnimation ? 180 : 240)]}
                      onChange={([runtimeMin, runtimeMax]) => setLocal({ ...local, runtimeMin, runtimeMax })}
                      formatValue={(v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`}
                    />
                  </section>
                )}

                {/* Awards */}
                <section>
                  <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {t('filters.awards')}
                  </h3>
                  <div className="flex gap-2">
                    {([undefined, 'winner', 'nominated'] as const).map((val) => (
                      <button
                        key={val ?? 'any'}
                        onClick={() => setLocal({ ...local, awards: val })}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                          local.awards === val
                            ? 'bg-accent/15 text-accent border border-accent'
                            : 'bg-surface-light text-text-muted border border-border'
                        }`}
                      >
                        {val === undefined
                          ? t('filters.awardsAny')
                          : val === 'winner'
                            ? t('filters.awardsWinner')
                            : t('filters.awardsNominated')}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Providers */}
                {providersData && providersData.providers.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                      {t('filters.providers')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {providersData.providers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => toggleProvider(p.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                            local.providers?.includes(p.id)
                              ? 'bg-accent/15 border border-accent'
                              : 'bg-surface-light border border-border'
                          }`}
                        >
                          {p.logoPath && (
                            <img
                              src={`https://image.tmdb.org/t/p/w45${p.logoPath}`}
                              alt=""
                              className="w-5 h-5 rounded object-cover"
                            />
                          )}
                          <span className={local.providers?.includes(p.id) ? 'text-accent' : 'text-text-muted'}>
                            {p.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Certification */}
                {certsData && certsData.certifications.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                      {t('filters.certification')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {certsData.certifications.map((cert) => (
                        <Chip
                          key={cert}
                          label={cert}
                          selected={local.certification?.includes(cert) ?? false}
                          onClick={() => toggleCertification(cert)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Countries */}
                {countriesData && countriesData.countries.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                      {t('filters.countries')}
                    </h3>
                    {/* Selected countries */}
                    {(local.countries?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {local.countries!.map((code) => {
                          const country = countriesData.countries.find((c) => c.code === code);
                          return (
                            <button
                              key={code}
                              onClick={() => toggleCountry(code)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-accent/15 border border-accent text-accent"
                            >
                              <span>{country?.flag} {code}</span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <SearchInput
                      value={countrySearch}
                      onChange={setCountrySearch}
                      placeholder={t('filters.countriesSearch')}
                    />
                    {countrySearch && (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface-light">
                        {filteredCountries.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-text-muted">{t('search.noResults')}</div>
                        ) : (
                          filteredCountries.slice(0, 20).map((c) => (
                            <button
                              key={c.code}
                              onClick={() => { toggleCountry(c.code); setCountrySearch(''); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface transition-colors ${
                                local.countries?.includes(c.code) ? 'text-accent' : 'text-text'
                              }`}
                            >
                              <span>{c.flag}</span>
                              <span>{c.code}</span>
                              <span className="ml-auto text-xs text-text-muted">{c.count}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Person search */}
                <section>
                  <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {t('filters.person')}
                  </h3>
                  {selectedPerson && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-accent/15 border border-accent text-accent">
                        {selectedPerson.name}
                        <button onClick={() => { setSelectedPerson(null); setLocal({ ...local, personId: undefined }); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    </div>
                  )}
                  <SearchInput
                    value={personSearch}
                    onChange={setPersonSearch}
                    placeholder={t('filters.personSearch')}
                  />
                  {personSearch.length >= 2 && personResults && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface-light">
                      {personResults.people.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-text-muted">{t('search.noResults')}</div>
                      ) : (
                        personResults.people.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedPerson({ id: p.id, name: p.name });
                              setLocal({ ...local, personId: p.id });
                              setPersonSearch('');
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface transition-colors text-text"
                          >
                            {p.photoPath && (
                              <img
                                src={`https://image.tmdb.org/t/p/w45${p.photoPath}`}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            )}
                            <span>{p.name}</span>
                            <span className="ml-auto text-xs text-text-muted capitalize">{p.knownFor}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </section>
              </div>

              {/* Footer buttons */}
              <div className="flex gap-3 px-4 py-3 border-t border-border">
                <Button variant="ghost" onClick={handleReset} fullWidth>
                  {t('filters.reset')}
                </Button>
                <Button variant="primary" onClick={handleApply} fullWidth>
                  {t('filters.apply')}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
