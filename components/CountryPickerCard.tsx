import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useLocale } from '@/context/LocaleContext';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { notify } from '@/lib/notify';
import { convertAmount, formatMoney } from '@/lib/currency';
import type { EuropeCountry } from '@/constants/europe';

/**
 * Sélecteur pays Europe + devise (conversion optionnelle des montants).
 */
export function CountryPickerCard() {
  const { colors } = useTheme();
  const { refresh } = useApp();
  const {
    country,
    countries,
    setCountryCode,
    detectCountryFromLocation,
    countryManual,
    refreshRates,
    ratesDate,
    moneySymbol,
    currency,
    rates,
  } = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [detecting, setDetecting] = useState(false);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(n) ||
        c.nameNative.toLowerCase().includes(n) ||
        c.code.toLowerCase().includes(n) ||
        c.currency.toLowerCase().includes(n)
    );
  }, [countries, q]);

  const applyCountry = async (c: EuropeCountry, convertExisting: boolean) => {
    await setCountryCode(c.code, convertExisting);
    await refresh();
    notify(
      'Pays',
      convertExisting && c.currency !== country.currency
        ? `${c.nameNative} · données converties en ${c.currency}`
        : `${c.nameNative} · ${c.currency}`
    );
  };

  const autoDetect = async () => {
    setDetecting(true);
    try {
      const code = await detectCountryFromLocation({ force: true });
      await refresh();
      if (code) {
        notify('Devise auto', `Pays détecté via GPS : ${code}`);
      } else {
        notify('Devise auto', 'Impossible de détecter le pays (GPS / réseau).');
      }
    } finally {
      setDetecting(false);
    }
  };

  const pick = (c: EuropeCountry) => {
    setOpen(false);
    setQ('');
    if (c.code === country.code) return;

    if (c.currency === country.currency) {
      void applyCountry(c, false);
      return;
    }

    const sample = convertAmount(100, country.currency, c.currency, rates);
    const sampleTxt = formatMoney(sample, c.currency, c.locale, c.symbol);
    const title = 'Changer de devise';
    const msg =
      `${country.nameNative} (${country.currency}) → ${c.nameNative} (${c.currency}).\n\n` +
      `Convertir les montants déjà enregistrés ?\nEx. 100 ${country.currency} ≈ ${sampleTxt}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${msg}\n\nOK = convertir, Annuler = changer sans convertir`)) {
        void applyCountry(c, true);
      } else {
        void applyCountry(c, false);
      }
      return;
    }

    Alert.alert(title, msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Sans convertir', onPress: () => void applyCountry(c, false) },
      { text: 'Convertir', onPress: () => void applyCountry(c, true) },
    ]);
  };

  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable onPress={() => setOpen(true)} style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Pays / devise</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {country.nameNative} · {currency} ({moneySymbol})
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            {countryManual ? 'Choix manuel' : 'Auto (locale / GPS)'} · taux FX {ratesDate || '…'}
          </Text>
        </Pressable>
        <View style={{ alignItems: 'flex-end', gap: 10, justifyContent: 'center' }}>
          <Pressable onPress={() => void autoDetect()} disabled={detecting} hitSlop={8}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
              {detecting ? 'GPS…' : 'Auto GPS'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setOpen(true)} hitSlop={8}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>Changer</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={open} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Pays en Europe</Text>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Rechercher (Allemagne, GBP, España…)"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.search,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
              ]}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => pick(item)}
                  style={[
                    styles.row,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: item.code === country.code ? colors.card : 'transparent',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {item.nameNative}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {item.name} · {item.currency} · ~{item.defaultFuelPrice} {item.symbol}/L
                    </Text>
                  </View>
                  {item.code === country.code && (
                    <Text style={{ color: colors.accent, fontWeight: '800' }}>✓</Text>
                  )}
                </Pressable>
              )}
            />
            <Pressable
              onPress={() => {
                void refreshRates().then(() => notify('Taux', 'Taux de change actualisés (BCE).'));
              }}
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ color: colors.accent, textAlign: 'center', fontWeight: '600' }}>
                Actualiser les taux de change
              </Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={{ paddingVertical: 10 }}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  value: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
