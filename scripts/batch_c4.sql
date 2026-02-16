UPDATE content SET overview_uk = v.overview_uk, has_uk_translation = true FROM (VALUES
  (2785, 'Ґоку та його друзі мають зупинити банду космічних піратів, які поїдають плоди Дерева Сили, перш ніж його руйнівна міць висмокче всю енергію Землі.')
) AS v(id, overview_uk) WHERE content.id = v.id;
