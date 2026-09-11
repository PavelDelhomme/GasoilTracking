/**
 * Page Aide — catégories + problèmes connus, recherche, liens vers l’app.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { getLocalAppVersion } from '@/lib/api';
import {
  filterHelp,
  type HelpArticle,
  type HelpCategory,
  type KnownIssue,
} from '@/lib/helpContent';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function kindLabel(kind: KnownIssue['kind']): string {
  if (kind === 'normal') return 'Normal';
  if (kind === 'limit') return 'Limite';
  return 'Astuce';
}

function kindColor(kind: KnownIssue['kind'], colors: { accent: string; warning: string; success: string }) {
  if (kind === 'normal') return colors.accent;
  if (kind === 'limit') return colors.warning;
  return colors.success;
}

export default function HelpScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [openCat, setOpenCat] = useState<string | null>('start');
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [openKnown, setOpenKnown] = useState(true);

  const { categories, known } = useMemo(() => filterHelp(query), [query]);

  const toggleCat = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenCat((c) => (c === id ? null : id));
  };

  const toggleArticle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenArticle((a) => (a === id ? null : id));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.hero, { color: colors.text }]}>Aide</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
          Guide pratique de Gasoil Tracking — v{getLocalAppVersion()}. Cherchez un mot, ou ouvrez une
          catégorie. Un seul bouton retour (en haut à gauche) suffit pour quitter cette page.
        </Text>

        <View
          style={[
            styles.search,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Ex. suivi libre, jauge, sync, panneau…"
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, color: colors.text, paddingVertical: 10, fontSize: 15 }}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            cat={cat}
            open={openCat === cat.id || !!query}
            openArticle={openArticle}
            onToggleCat={() => toggleCat(cat.id)}
            onToggleArticle={toggleArticle}
            colors={colors}
          />
        ))}

        {!categories.length && !known.length ? (
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
            Aucun résultat pour « {query} ». Essayez « plein », « GPS », « budget »…
          </Text>
        ) : null}

        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setOpenKnown((v) => !v);
          }}
          style={[styles.knownHead, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
              Problèmes connus & comportements normaux
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Ce qui peut surprendre sans être un bug
            </Text>
          </View>
          <Ionicons
            name={openKnown || query ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>

        {(openKnown || !!query) &&
          known.map((k) => (
            <View
              key={k.id}
              style={[styles.knownCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <View style={styles.knownRow}>
                <View
                  style={[
                    styles.kindBadge,
                    { backgroundColor: kindColor(k.kind, colors) + '22' },
                  ]}
                >
                  <Text
                    style={{
                      color: kindColor(k.kind, colors),
                      fontWeight: '800',
                      fontSize: 11,
                    }}
                  >
                    {kindLabel(k.kind)}
                  </Text>
                </View>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1, fontSize: 14 }}>
                  {k.title}
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8 }}>
                {k.body}
              </Text>
            </View>
          ))}

        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            textAlign: 'center',
            marginTop: 20,
            lineHeight: 18,
          }}
        >
          Une question absente ? Notez-la et signalez-la : l’aide évolue avec l’app.
        </Text>
      </ScrollView>
    </View>
  );
}

function CategoryBlock({
  cat,
  open,
  openArticle,
  onToggleCat,
  onToggleArticle,
  colors,
}: {
  cat: HelpCategory;
  open: boolean;
  openArticle: string | null;
  onToggleCat: () => void;
  onToggleArticle: (id: string) => void;
  colors: {
    text: string;
    textSecondary: string;
    card: string;
    border: string;
    accent: string;
  };
}) {
  return (
    <View style={[styles.cat, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Pressable onPress={onToggleCat} style={styles.catHead}>
        <View style={[styles.catIcon, { backgroundColor: colors.accent + '18' }]}>
          <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{cat.title}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {cat.subtitle}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
      {open
        ? cat.articles.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              open={openArticle === a.id}
              onToggle={() => onToggleArticle(a.id)}
              colors={colors}
            />
          ))
        : null}
    </View>
  );
}

function ArticleRow({
  article,
  open,
  onToggle,
  colors,
}: {
  article: HelpArticle;
  open: boolean;
  onToggle: () => void;
  colors: {
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
  };
}) {
  return (
    <View style={[styles.article, { borderTopColor: colors.border }]}>
      <Pressable onPress={onToggle} style={styles.articleHead}>
        <Text style={{ color: colors.text, fontWeight: '700', flex: 1, fontSize: 14 }}>
          {article.title}
        </Text>
        <Ionicons
          name={open ? 'remove' : 'add'}
          size={18}
          color={colors.accent}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 12, paddingHorizontal: 12 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
            {article.body}
          </Text>
          {article.link ? (
            <Pressable
              onPress={() => router.push(article.link!.href as never)}
              style={[styles.linkBtn, { borderColor: colors.accent }]}
            >
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>
                {article.link.label}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  hero: { fontSize: 26, fontWeight: '900', marginBottom: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  cat: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  catHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  catIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  article: { borderTopWidth: StyleSheet.hairlineWidth },
  articleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  knownHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  knownCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  knownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
});
