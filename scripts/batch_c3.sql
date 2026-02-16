UPDATE content SET overview_uk = v.overview_uk, has_uk_translation = true FROM (VALUES
  (727, 'Простежте за епічною подорожжю одного чоловіка, який перетворюється з хитрого неповнолітнього контрабандиста наркотиків на одного з найвідоміших лідерів картелю у світі.')
) AS v(id, overview_uk) WHERE content.id = v.id;
