import { useEffect, useState } from 'react';
import { TextInput, NumberInput, Button, Stack, Container, Title, Group, ActionIcon, Paper, List, Text, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash, IconPlus, IconToolsKitchen2 } from '@tabler/icons-react';
import { supabase } from './supabaseClient';

// 型の定義（どんなデータか名前をつける）
interface Ingredient {
  name: string;
  price: number;
}

interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const form = useForm({
    initialValues: {
      recipeName: '',
      ingredients: [{ name: '', price: 0 }],
    },
  });

  // データを取得する関数
  const fetchRecipes = async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        id,
        name,
        ingredients (
          name,
          price
        )
      `);
    
    if (!error && data) {
      setRecipes(data as any);
    }
  };

  // 画面が開いた時に実行
  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleSave = async (values: typeof form.values) => {
    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert([{ name: values.recipeName }])
      .select().single();

    if (recipeError) return;

    const ingredientsToSave = values.ingredients.map((ing) => ({
      recipe_id: recipeData.id,
      name: ing.name,
      price: ing.price,
    }));

    await supabase.from('ingredients').insert(ingredientsToSave);
    
    form.reset();
    fetchRecipes(); // 登録後にリストを更新
  };

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        {/* --- 登録フォーム --- */}
        <Paper withBorder p="xl" radius="md" shadow="sm">
          <Title order={2} mb="lg">レシピを登録する</Title>
          <form onSubmit={form.onSubmit(handleSave)}>
            <Stack>
              <TextInput label="料理名" placeholder="カレー" required {...form.getInputProps('recipeName')} />
              {form.values.ingredients.map((_, index) => (
                <Group key={index} align="flex-end">
                  <TextInput label="材料" style={{ flex: 1 }} {...form.getInputProps(`ingredients.${index}.name`)} />
                  <NumberInput label="価格" style={{ width: 100 }} {...form.getInputProps(`ingredients.${index}.price`)} />
                  <ActionIcon color="red" variant="light" onClick={() => form.removeListItem('ingredients', index)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button variant="outline" leftSection={<IconPlus size={16} />} onClick={() => form.insertListItem('ingredients', { name: '', price: 0 })}>
                材料を追加
              </Button>
              <Button type="submit" fullWidth mt="md">保存</Button>
            </Stack>
          </form>
        </Paper>

        <Divider label="登録済みレシピ" labelPosition="center" />

        {/* --- 一覧表示エリア --- */}
        <Stack>
          {recipes.length === 0 ? (
            <Text c="dimmed" ta="center">レシピがまだありません</Text>
          ) : (
            recipes.map((recipe) => (
              <Paper key={recipe.id} withBorder p="md" radius="md">
                <Group justify="space-between" mb="xs">
                  <Group>
                    <IconToolsKitchen2 size={20} color="orange" />
                    <Text fw={700} size="lg">{recipe.name}</Text>
                  </Group>
                  <Text size="sm" fw={700} c="blue">
                    合計: {recipe.ingredients.reduce((sum, i) => sum + i.price, 0)}円
                  </Text>
                </Group>
                <List size="sm" c="dimmed" withPadding>
                  {recipe.ingredients.map((ing, idx) => (
                    <List.Item key={idx}>{ing.name} ({ing.price}円)</List.Item>
                  ))}
                </List>
              </Paper>
            ))
          )}
        </Stack>
      </Stack>
    </Container>
  );
}